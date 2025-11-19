import { OfferProposalFilterFactory } from '@golem-sdk/golem-js';
import { plansDb, pricesDb, nodesDb } from './db.js';
import { glm, shutdown } from './glm.js';
import { getNodeState } from './matrix.js';
import { ethers } from 'ethers';
import { logger } from './logger.js';
import { deprovisionNode, Node, provisionNode } from './provider.js';
import { k8sApi, k8sProviderNamespace } from './k8s.js';
import config from 'config';
import { ApiException } from '@kubernetes/client-node';

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

type GpuInfo = {
  PROP_CARD_NAME: string;
  PROP_CUDA_SUPPORTED: string;
  PROP_CUDA_CAPABILITY: string;
  PROP_CLOCK_GPU: string;
  PROP_CLOCK_MEM: string;
  PROP_MEM_SIZE: string;
  PROP_MEM_BANDWIDTH: string;
};

export async function executePlan(initialJob: Job, gpuClassesMap: Map<string, GpuClass>) {
  // Get node state from Matrix
  const nodeState = await getNodeState(initialJob.node_id);
  if (!nodeState) {
    throw new Error(`Node state not found for node_id=${initialJob.node_id}`);
  }

  let gpuOfferTemplate: Record<string, any> = {};
  if (initialJob.gpu_class_id != '' && initialJob.gpu_class_id != null) {
    // Find the GPU that matches the plan's GPU class ID
    const gpuClass = gpuClassesMap.get(initialJob.gpu_class_id);
    if (!gpuClass) {
      throw new Error(`GPU class not found for gpu_class_id=${initialJob.gpu_class_id}`);
    }
    // Find a GPU on the node that matches the GPU class filters
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

    // Construct offer template based on matching GPU
    gpuOfferTemplate = {
      "golem.!exp.gap-35.v1.inf.gpu.clocks.graphics.mhz": parseInt(matchingGpu.PROP_CLOCK_GPU),
      "golem.!exp.gap-35.v1.inf.gpu.clocks.memory.mhz": parseInt(matchingGpu.PROP_CLOCK_MEM),
      "golem.!exp.gap-35.v1.inf.gpu.cuda.compute-capability": matchingGpu.PROP_CUDA_CAPABILITY,
      "golem.!exp.gap-35.v1.inf.gpu.cuda.enabled": matchingGpu.PROP_CUDA_SUPPORTED == "1",
      "golem.!exp.gap-35.v1.inf.gpu.cuda.version": matchingGpu.PROP_CUDA_CAPABILITY,
      "golem.!exp.gap-35.v1.inf.gpu.memory.bandwidth.gib": parseFloat(matchingGpu.PROP_MEM_BANDWIDTH),
      "golem.!exp.gap-35.v1.inf.gpu.memory.total.gib": parseInt(matchingGpu.PROP_MEM_SIZE) / 1024,
      "golem.!exp.gap-35.v1.inf.gpu.model": matchingGpu.PROP_CARD_NAME
    };

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
       logger.info(`Inserted new node wallet with node_id=${initialJob.node_id}`);

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
  const whitelistProviderIds = [nodeWallet.wallet_address.toLowerCase()];

  do {
    // Get the latest GLM-USD price
    const glmPrice = await pricesDb.get<{ price_usd: number }>(
      `SELECT price_usd FROM glm_price ORDER BY fetched_at DESC LIMIT 1`
    );

    if (!glmPrice) {
      throw new Error('No GLM-USD price available');
    }

    const glmEnvPerHourPrice = currentJob.usd_per_hour / glmPrice.price_usd;

    // Prepare the node definition for provisioning
    const node: Node = {
      name: `node-${initialJob.node_id}`,
      environment: {
        NODE_NAME: `node-${initialJob.node_id}`,
        SUBNET: "public",
        YA_ACCOUNT: config.get<string>("yagnaAccount"),
        YA_PAYMENT_NETWORK_GROUP: "mainnet",
        YA_NET_TYPE: "central",
        CENTRAL_NET_HOST: "polygongas.org:7999",
        YAGNA_AUTOCONF_ID_SECRET: wallet.privateKey.substring(2) // remove '0x' prefix
      },
      offerTemplate: {
        ...gpuOfferTemplate,
        "golem.inf.cpu.brand": `${nodeState.systemInformation.cpu.manufacturer} ${nodeState.systemInformation.cpu.brand}`,
        "golem.inf.cpu.model": `Stepping ${nodeState.systemInformation.cpu.stepping} Family ${nodeState.systemInformation.cpu.family} Model ${nodeState.systemInformation.cpu.model}`,
        "golem.inf.cpu.vendor": nodeState.systemInformation.cpu.vendor
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

    logger.info(`Provisioning node_id=${initialJob.node_id} with wallet address=${nodeWallet.wallet_address.toLowerCase()}`);
    await ensurePodReady(node, k8sProviderNamespace, shutdown.signal);

    // Do the work for the current job
    logger.info(`Executing job for node_id=${currentJob.node_id} (plan_id=${currentJob.node_plan_id})`);

    // Create a controller that races shutdown and timeout
    const rentalAbortController = new AbortController();
    const shutdownListener = () => rentalAbortController.abort();
    shutdown.signal.addEventListener('abort', shutdownListener);

    // 10 minutes in ms
    const timeoutId = setTimeout(() => rentalAbortController.abort(), 10 * 60 * 1000);

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
        signalOrTimeout: rentalAbortController.signal,
      });

      // Clear the timeout upon successful rental
      clearTimeout(timeoutId);

      const exe = await rental.getExeUnit();
      const remoteProcess = await exe.runAndStream(
        currentJob.node_id,
        [JSON.stringify({ duration: currentJob.duration / 1000 })],
        {
          signalOrTimeout: rentalAbortController.signal
        }
      );

      remoteProcess.stdout.subscribe((data: string) => console.log(`${currentJob!.node_id} stdout>`, data));
      remoteProcess.stderr.subscribe((data: string) => console.error(`${currentJob!.node_id} stderr>`, data));

      const runtimeTimeout = Math.round(currentJob.adjusted_duration * 1.02);
      logger.info(`Executing job with runtime timeout ${runtimeTimeout} ms`);

      await remoteProcess.waitForExit(runtimeTimeout);
    } catch (err) {
      logger.error(`Error during execution of job for node_id=${currentJob.node_id} (plan_id=${currentJob.node_plan_id}):`);
      console.error(err);
      throw err;
    } finally {
      clearTimeout(timeoutId);
      shutdown.signal.removeEventListener('abort', shutdownListener);
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
    }

    // Grab the next job from the plan, if any
    const nextJob = await plansDb.get<Job>(`
      SELECT
        np.node_id,
        np.org_name,
        np.usd_per_hour,
        np.gpu_class_id,
        npj.node_plan_id,
        npj.order_index,
        npj.duration AS adjusted_duration
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

// Ensure the Pod is ready by deprovisioning any existing Pod and provisioning a new one
async function ensurePodReady(
  node: Node,
  namespace: string,
  signal?: AbortSignal
) {
  let podExists = false;
  let isTerminating = false;

  try {
    const res = await k8sApi.readNamespacedPod({ name:node.name, namespace });
    podExists = true;
    isTerminating = res.metadata?.deletionTimestamp !== undefined;
  } catch (err) {
    if (err instanceof ApiException && err.code === 404) {
      podExists = false;
    }
  }

  if (podExists && !isTerminating) {
    try {
      await deprovisionNode(k8sApi, namespace, node);
      logger.info(`Deprovisioned existing pod ${node.name}`);
      isTerminating = true;
    } catch (err) {
      logger.error(`Error deprovisioning existing pod ${node.name}:`);
    }
  }

  if (podExists && isTerminating) {
    // Poll until the pod is deleted or cancelled
    while (true) {
      if (signal?.aborted) throw new Error('ensurePodReady cancelled');
      try {
        logger.info(`Waiting for terminating pod ${node.name} to be deleted...`);
        await new Promise(res => setTimeout(res, 10000));
        await k8sApi.readNamespacedPod({ name:node.name, namespace });
      } catch (err) {
        if (err instanceof ApiException && err.code === 404) {
          logger.info(`Pod ${node.name} has been deleted.`);
          break;
        }
        throw err;
      }
    }
  }

  if (signal?.aborted) throw new Error('ensurePodReady cancelled');
  await provisionNode(k8sApi, namespace, node);
  logger.info(`Provisioned pod ${node.name}`);
}
