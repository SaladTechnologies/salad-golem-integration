import { plansDb, pricesDb, nodesDb } from './db.mjs';
import { glm, shutdown } from './glm.mjs';
import { getNodeState } from './matrix.mjs';

/**
 * Execute a plan with an initial job.
 * @param {Object} initialJob - The initial job to execute.
 * @param {Map} gpuClassesMap - Map of GPU class IDs to GPU class details.
 */
export async function executePlan(initialJob, gpuClassesMap) {
  // Get node state from Matrix
  const nodeState = await getNodeState(initialJob.node_id);
  if (!nodeState) {
    throw new Error(`Node state not found for node_id=${initialJob.node_id}`);
  }

  if (initialJob.gpu_class_id != '' && initialJob.gpu_class_id != null)
    {
    // Find the GPU that matches the plan's GPU class ID
    const gpuClass = gpuClassesMap.get(initialJob.gpu_class_id);
    if (!gpuClass) {
      throw new Error(`GPU class not found for gpu_class_id=${initialJob.gpu_class_id}`);
    }

    // Find a GPU on the node that matches the GPU class filters
    let matchingGpu = null;
    for (const [key, value] of Object.entries(nodeState.gpuZ)) {
      // Check if the GPU name matches the GPU class regexp
      if (new RegExp(gpuClass.filters.gpuCardNameInclude).test(value.PROP_CARD_NAME)) {
        console.log(`Node ${initialJob.node_id} GPU ${value.name} matches GPU class regexp ${gpuClass.name_regexp}`);
        matchingGpu = value;
        break;
      }
    }

    if (!matchingGpu) {
      throw new Error(`No matching GPU found on node_id=${initialJob.node_id} for gpu_class_id=${initialJob.gpu_class_id}`);
    }

    console.log(`Node ${initialJob.node_id} has matching GPU: ${matchingGpu.name} (${matchingGpu.id})`);
  }

  // Retrieve the node wallet
  const nodeWallet = await nodesDb.get(`
    SELECT
      wallet_address,
      wallet_mnemonic
    FROM node_wallets
    WHERE node_id = $nodeId
    `, {
    $nodeId: initialJob.node_id
  });

  // If no wallet exists, create one
  if (!nodeWallet) {
    // Create a new wallet for the node
    const wallet = ethers.Wallet.createRandom();
    console.log(`Creating new wallet for node_id=${job.node_id} with address=${wallet.address}`);

    // Insert node wallet into database
    await nodesDb.run(`
      INSERT INTO node_wallets (
        node_id,
        wallet_address,
        wallet_mnemonic
      ) VALUES (
        $nodeId,
        $walletAddress,
        $walletMnemonic
      )
    `, {
      $nodeId: job.node_id,
      $walletAddress: wallet.address,
      $walletMnemonic: wallet.mnemonic.phrase
    });
    console.log(`Inserted new node with node_id=${job.node_id}`);

    nodeWallet = {
      wallet_address: wallet.address,
      wallet_mnemonic: wallet.mnemonic.phrase
    };
  }

  // TODO: Provision provider with K8s cluster

  // Simulate job execution
  let currentJob = initialJob;

  do {
    // Get the latest GLM-USD price
    const glmPrice = await pricesDb.get(`
      SELECT
        price_usd
      FROM glm_price
      ORDER BY fetched_at DESC
      LIMIT 1
    `);

    if (!glmPrice) {
      throw new Error('No GLM-USD price available');
    }

    // Do the work for the current job
    console.log(`Executing job for node_id=${currentJob.node_id} (plan_id=${currentJob.node_plan_id})`);

    // Integrate with Golem Network to run the job
    try {
      const glmEnvPerHourPrice = currentJob.usd_per_hour / glmUsdPrice.price_usd_per_unit;
      console.log(`Requesting rental with env per hour price: ${glmEnvPerHourPrice.toFixed(6)} GLM/hour`);

      const rental = await glm.oneOf({
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
            rentHours: currentJob.adjusted_duration / (1000 * 60 * 60), // convert ms to hours
            pricing: {
              model: "linear",
              maxStartPrice: 0.0,
              maxCpuPerHourPrice: 0.0,
              maxEnvPerHourPrice: glmEnvPerHourPrice,
            },
            // TODO: Apply whitelist filter
          },
        },
        // Pass abort signal to the rental
        signalOrTimeout: shutdown.signal,
      });

      const exe = await rental.getExeUnit();
      const remoteProcess = await exe.runAndStream(
        currentJob.node_id,
        [JSON.stringify({ duration: currentJob.duration / 1000 })], // Run for the job's duration
        {
          // Pass abort signal to the command execution
          signalOrTimeout: shutdown.signal
        }
      );

      remoteProcess.stdout
        .subscribe((data) => console.log(`${currentJob.node_id} stdout>`, data));

      remoteProcess.stderr
        .subscribe((data) => console.error(`${currentJob.node_id} stderr>`, data));

      await remoteProcess.waitForExit(currentJob.duration * 1.05 / 1000); // wait with a small buffer
    } finally {
      await rental.stopAndFinalize();
    }

    console.log(`Finished job for node_id=${currentJob.node_id} (plan_id=${currentJob.node_plan_id})`);

    // Grab the next job from the plan, if any
    currentJob = await plansDb.get(`
      SELECT
        np.node_id,
        np.usd_per_hour,
        np.gpu_class_id,
        npj.node_plan_id,
        npj.order_index,
        npj.start_at + npj.duration - $adjustedNow AS adjusted_duration
      FROM node_plan_job npj
      JOIN node_plan np ON np.id = npj.node_plan_id
      WHERE npj.node_plan_id = $nodePlanId
        AND npj.order_index = $nextOrderIndex
    `, {
      $nodePlanId: initialJob.node_plan_id,
      $nextOrderIndex: initialJob.order_index + 1
    });
    // Loop until there are no more jobs in the plan
  } while (currentJob != null);

  console.log(`All jobs for plan_id=${initialJob.node_plan_id} completed.`);

  // TODO: Deprovision provider with K8s cluster
}
