import { OfferProposalFilterFactory } from '@golem-sdk/golem-js';
import { plansDb, pricesDb, nodesDb } from './db.js';
import { glm, shutdown } from './glm.js';
import { getNodeState } from './matrix.js';
import { ethers } from 'ethers';
import { logger } from './logger.js';

interface Job {
  node_id: string;
  gpu_class_id: string;
  node_plan_id: string;
  order_index: number;
  usd_per_hour: number;
  adjusted_duration: number;
  duration: number;
}

interface GpuClass {
  filters: { gpuCardNameInclude: string };
  name_regexp: string;
}

export async function executePlan(initialJob: Job, gpuClassesMap: Map<string, GpuClass>) {
  // Get node state from Matrix
  const nodeState = await getNodeState(initialJob.node_id);
  if (!nodeState) {
    throw new Error(`Node state not found for node_id=${initialJob.node_id}`);
  }

  if (initialJob.gpu_class_id != '' && initialJob.gpu_class_id != null) {
    // Find the GPU that matches the plan's GPU class ID
    const gpuClass = gpuClassesMap.get(initialJob.gpu_class_id);
    if (!gpuClass) {
      throw new Error(`GPU class not found for gpu_class_id=${initialJob.gpu_class_id}`);
    }

       // Find a GPU on the node that matches the GPU class filters
       type GpuInfo = { PROP_CARD_NAME: string; name?: string; id?: string };
       let matchingGpu: GpuInfo | null = null;
       for (const [key, value] of Object.entries(nodeState.gpuZ)) {
         const gpu = value as GpuInfo;
         if (new RegExp(gpuClass.filters.gpuCardNameInclude).test(gpu.PROP_CARD_NAME)) {
           console.log(`Node ${initialJob.node_id} GPU ${gpu.PROP_CARD_NAME ?? ''} matches GPU class regexp ${gpuClass.name_regexp}`);
           matchingGpu = gpu;
           break;
         }
       }

       if (!matchingGpu) {
         throw new Error(`No matching GPU found on node_id=${initialJob.node_id} for gpu_class_id=${initialJob.gpu_class_id}`);
       }

       console.log(`Node ${initialJob.node_id} has matching GPU: ${matchingGpu.PROP_CARD_NAME ?? ''}`);
  }

  // Retrieve the node wallet
  let nodeWallet = await nodesDb.get<{
    wallet_address: string;
    wallet_mnemonic: string;
  }>(
    `SELECT wallet_address, wallet_mnemonic FROM node_wallets WHERE node_id = $nodeId`,
    { $nodeId: initialJob.node_id }
  );

  // If no wallet exists, create one
  if (!nodeWallet) {
       // Create a new wallet for the node
       const wallet = ethers.Wallet.createRandom();
       console.log(`Creating new wallet for node_id=${initialJob.node_id} with address=${wallet.address}`);

       // Insert node wallet into database
       const mnemonicPhrase = wallet.mnemonic?.phrase ?? '';
       await nodesDb.run(
         `INSERT INTO node_wallets (node_id, wallet_address, wallet_mnemonic) VALUES ($nodeId, $walletAddress, $walletMnemonic)`,
         {
           $nodeId: initialJob.node_id,
           $walletAddress: wallet.address,
           $walletMnemonic: mnemonicPhrase
         }
       );
       console.log(`Inserted new node with node_id=${initialJob.node_id}`);

       nodeWallet = {
         wallet_address: wallet.address,
         wallet_mnemonic: mnemonicPhrase
       };
  }

  // TODO: Provision provider with K8s cluster

  // Simulate job execution
  let currentJob: Job | null = initialJob;

  // Prepare whitelist of provider IDs (node wallet address)
  const whitelistProviderIds = [nodeWallet.wallet_address];

  do {
    // Get the latest GLM-USD price
    const glmPrice = await pricesDb.get<{ price_usd: number }>(
      `SELECT price_usd FROM glm_price ORDER BY fetched_at DESC LIMIT 1`
    );

    if (!glmPrice) {
      throw new Error('No GLM-USD price available');
    }

    // Do the work for the current job
    console.log(`Executing job for node_id=${currentJob.node_id} (plan_id=${currentJob.node_plan_id})`);

    // Integrate with Golem Network to run the job
    let rental: any;
    try {
      const glmEnvPerHourPrice = currentJob.usd_per_hour / glmPrice.price_usd;
      const rentHours = Math.round((currentJob.adjusted_duration / (1000 * 60 * 60)) * 10) / 10
      logger.info(`Requesting rental for ${rentHours} hours with env per hour price: ${glmEnvPerHourPrice.toFixed(6)} GLM/hour`);

      rental = await glm.oneOf({
        order: {
          demand: {
            workload: {
              runtime: {
                name: "salad",
              },
              imageTag: "golem/alpine:latest",
            },
          },
          market: {
            rentHours: rentHours,
            pricing: {
              model: "linear",
              maxStartPrice: 0.0,
              maxCpuPerHourPrice: 0.0,
              maxEnvPerHourPrice: glmEnvPerHourPrice * 1.002,
            },
            offerProposalFilter: OfferProposalFilterFactory.allowProvidersById(whitelistProviderIds)
          },
        },
        signalOrTimeout: shutdown.signal,
      });

      const exe = await rental.getExeUnit(Math.round(currentJob.adjusted_duration * 1.01));
      const remoteProcess = await exe.runAndStream(
        currentJob.node_id,
        [JSON.stringify({ duration: currentJob.duration / 1000 })],
        {
          signalOrTimeout: shutdown.signal
        }
      );

      remoteProcess.stdout.subscribe((data: string) => console.log(`${currentJob!.node_id} stdout>`, data));
      remoteProcess.stderr.subscribe((data: string) => console.error(`${currentJob!.node_id} stderr>`, data));

      await remoteProcess.waitForExit(currentJob.duration * 1.05 / 1000);
    } finally {
      if (rental) await rental.stopAndFinalize();
    }

    console.log(`Finished job for node_id=${currentJob.node_id} (plan_id=${currentJob.node_plan_id})`);

       // Grab the next job from the plan, if any
       const nextJob = await plansDb.get<Job>(
         `SELECT np.node_id, np.usd_per_hour, np.gpu_class_id, npj.node_plan_id, npj.order_index, npj.start_at + npj.duration - $adjustedNow AS adjusted_duration, npj.duration
         FROM node_plan_job npj
         JOIN node_plan np ON np.id = npj.node_plan_id
         WHERE npj.node_plan_id = $nodePlanId
           AND npj.order_index = $nextOrderIndex`,
         {
           $nodePlanId: initialJob.node_plan_id,
           $nextOrderIndex: initialJob.order_index + 1
         }
       );
       currentJob = nextJob ?? null;
    // Loop until there are no more jobs in the plan
  } while (currentJob != null);

  console.log(`All jobs for plan_id=${initialJob.node_plan_id} completed.`);

  // TODO: Deprovision provider with K8s cluster
}
