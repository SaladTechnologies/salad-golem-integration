import { OfferProposalFilterFactory } from '@golem-sdk/golem-js';
import { plansDb, pricesDb, nodesDb } from './db.js';
import { glm, shutdown } from './glm.js';
import { getNodeState } from './matrix.js';
import { ethers } from 'ethers';
import { logger } from './logger.js';
import { deprovisionNode, Node, provisionNode } from './provider.js';
import { k8sApi, k8sProviderNamespace } from './k8s.js';

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
           logger.info(`Node ${initialJob.node_id} GPU ${gpu.PROP_CARD_NAME ?? ''} matches GPU class regexp ${gpuClass.name_regexp}`);
           matchingGpu = gpu;
           break;
         }
       }

       if (!matchingGpu) {
         throw new Error(`No matching GPU found on node_id=${initialJob.node_id} for gpu_class_id=${initialJob.gpu_class_id}`);
       }

       logger.info(`Node ${initialJob.node_id} has matching GPU: ${matchingGpu.PROP_CARD_NAME ?? ''}`);
  }

  // Retrieve the node wallet
  let nodeWallet = await nodesDb.get<{
    wallet_address: string;
    wallet_mnemonic: string;
  }>(
    `SELECT wallet_address, wallet_mnemonic FROM node_wallets WHERE node_id = $nodeId`,
    { $nodeId: initialJob.node_id }
  );

  let wallet = null;
  // If no wallet exists, create one
  if (!nodeWallet) {
       // Create a new wallet for the node
       wallet = ethers.Wallet.createRandom();
       logger.info(`Creating new wallet for node_id=${initialJob.node_id} with address=${wallet.address}`);

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
       logger.info(`Inserted new node with node_id=${initialJob.node_id}`);

       nodeWallet = {
         wallet_address: wallet.address,
         wallet_mnemonic: mnemonicPhrase
       };
  }
  else {
    wallet = ethers.Wallet.fromPhrase(nodeWallet.wallet_mnemonic);
  }

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

    const glmEnvPerHourPrice = currentJob.usd_per_hour / glmPrice.price_usd;

    // Provision provider with K8s cluster
    const node: Node = {
      name: `node-${initialJob.node_id}-${initialJob.node_plan_id}-${initialJob.order_index}`,
      environment: {
        NODE_NAME: `node-${initialJob.node_id}`,
        SUBNET: "public",
        YA_ACCOUNT: "0xf0ef26ae45b90c218104384d84f2092efa09aeb0",
        YA_PAYMENT_NETWORK_GROUP: "testnet",
        YAGNA_AUTOCONF_ID_SECRET: wallet.privateKey.substring(2) // remove '0x' prefix
      },
      offerTemplate: {
        "golem.!exp.gap-35.v1.inf.gpu.clocks.graphics.mhz": 1950,
        "golem.!exp.gap-35.v1.inf.gpu.clocks.memory.mhz": 1750,
        "golem.!exp.gap-35.v1.inf.gpu.clocks.sm.mhz": 1950,
        "golem.!exp.gap-35.v1.inf.gpu.clocks.video.mhz": 1950,
        "golem.!exp.gap-35.v1.inf.gpu.cuda.compute-capability": "8.6",
        "golem.!exp.gap-35.v1.inf.gpu.cuda.cores": 4864,
        "golem.!exp.gap-35.v1.inf.gpu.cuda.enabled": true,
        "golem.!exp.gap-35.v1.inf.gpu.cuda.version": "13.0",
        "golem.!exp.gap-35.v1.inf.gpu.memory.bandwidth.gib": 448.0,
        "golem.!exp.gap-35.v1.inf.gpu.memory.total.gib": 8.0,
        "golem.!exp.gap-35.v1.inf.gpu.model": "NVIDIA GeForce RTX 3060 Ti",
        "golem.inf.cpu.brand": "Intel(R) Core(TM) i9-14900K",
        "golem.inf.cpu.model": "Stepping 1 Family 6 Model 183",
        "golem.inf.cpu.vendor": "GenuineIntel"
      },
      presets: {
        "ver": "V1",
        "active": [
          "salad"
        ],
        "presets": [
          {
            "name": "default",
            "exeunit-name": "wasmtime",
            "pricing-model": "linear",
            "initial-price": 0.0,
            "usage-coeffs": {}
          },
          {
            "name": "salad",
            "exeunit-name": "salad",
            "pricing-model": "linear",
            "initial-price": 0.0,
            "usage-coeffs": {
              "golem.usage.cpu_sec": 0,
              "golem.usage.duration_sec": glmEnvPerHourPrice / 3600
            }
          }
        ]
      }
    };

    try {
      logger.info(`Provisioning node_id=${initialJob.node_id} with wallet address=${nodeWallet.wallet_address}`);
      await provisionNode(k8sApi, k8sProviderNamespace, node);
      logger.info(`Provisioned node_id=${initialJob.node_id} with wallet address=${nodeWallet.wallet_address}`);
    } catch (error) {
      logger.error(`Error provisioning node_id=${initialJob.node_id}`);
      console.log(error);
      throw error;
    }

    // Do the work for the current job
    logger.info(`Executing job for node_id=${currentJob.node_id} (plan_id=${currentJob.node_plan_id})`);

    // Integrate with Golem Network to run the job
    let rental: any;
    try {
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

    logger.info(`Finished job for node_id=${currentJob.node_id} (plan_id=${currentJob.node_plan_id})`);

    // Deprovision provider from K8s cluster
    try {
      logger.info(`Deprovisioning node_id=${initialJob.node_id}`);
      await deprovisionNode(k8sApi, k8sProviderNamespace, node);
      logger.info(`Deprovisioned node_id=${initialJob.node_id}`);
    } catch (error) {
      logger.error(`Error deprovisioning node_id=${initialJob.node_id}`);
      console.log(error);
      throw error;
    }

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

  logger.info(`All jobs for plan_id=${initialJob.node_plan_id} completed.`);


}
