import { plansDb } from './db.mjs';
import { glm, shutdown } from './glm.mjs';

/**
 * Execute a plan with an initial job.
 * @param {Object} initialJob - The initial job to execute.
 */
export async function executePlan(initialJob) {
  // TODO: Allocate resources as needed

  // Simulate job execution
  let currentJob = initialJob;

  do {
    // Do the work for the current job
    console.log(`Executing job for node_id=${currentJob.node_id} (plan_id=${currentJob.node_plan_id})`);

    // TODO: Integrate with Golem Network to run the job
    try {
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
              maxCpuPerHourPrice: 1.0,
              maxEnvPerHourPrice: 0.0,
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
        np.gpu_class_id,
        npj.node_plan_id,
        npj.order_index,
        npj.start_at + npj.duration - $adjustedNow AS adjusted_duration,
        (npj.start_at + npj.duration - $adjustedNow) / CAST(npj.duration AS REAL) * npj.invoice_amount AS adjusted_invoice_amount
      FROM node_plan_job npj
      JOIN node_plan np ON np.id = npj.node_plan_id AND np.status != 'completed'
      WHERE npj.node_plan_id = $nodePlanId
        AND npj.order_index = $nextOrderIndex
    `, {
      $nodePlanId: initialJob.node_plan_id,
      $nextOrderIndex: initialJob.order_index + 1
    });
    // Loop until there are no more jobs in the plan
  } while (currentJob != null);

  // Mark plan as completed in database
  await plansDb.run(`
    UPDATE node_plan
    SET status = 'completed'
    WHERE id = $nodePlanId
  `, {
    $nodePlanId: initialJob.node_plan_id
  });

  console.log(`All jobs for plan_id=${initialJob.node_plan_id} completed.`);

  // TODO: Shutdown resources as needed
}
