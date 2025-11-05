
import config from 'config';
import timespan from 'timespan-parser';
import { plansDb, pricesDb } from './db.mjs';

// Track active plans to prevent overlapping executions
let activePlans = new Map();

/**
 * Process plans that are due to start.
 */
export async function processPlans() {
  // Get the latest GLM-USD price
  const glmPrice = await pricesDb.get(`
    SELECT
      price_usd
    FROM glm_price
    ORDER BY fetched_at DESC
    LIMIT 1
  `);

  if (!glmPrice) {
    console.warn('No GLM-USD price available. Skipping plan processing.');
    return;
  }

  const now = Date.now();

  // Subtract time lag from config
  const timespanParser = timespan({ unit: 'ms' });
  const timeLag = timespanParser.parse(config.get('timeLag'));
  const adjustedNow = now - timeLag;
  const minimumDuration = timespanParser.parse(config.get('minimumDuration'));

  const jobs = await plansDb.all(`
    SELECT
      np.node_id,
      np.usd_per_hour,
      np.gpu_class_id,
      npj.node_plan_id,
      npj.order_index,
      npj.start_at + npj.duration - $adjustedNow AS adjusted_duration
    FROM node_plan_job npj
    JOIN node_plan np ON np.id = npj.node_plan_id AND np.status = 'pending'
    WHERE $adjustedNow > npj.start_at
      AND $adjustedNow < npj.start_at + npj.duration
      AND npj.start_at + npj.duration - $adjustedNow > $minimumDuration
  `, {
    $adjustedNow: adjustedNow,
    $minimumDuration: minimumDuration,
  });

  console.log(`Processing ${jobs.length} due jobs at ${new Date(now).toISOString()}`);

  for (const job of jobs) {
    // Skip if already processing
    if (activePlans.has(job.node_id)) {
      console.log(`Plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}) is already active. Skipping.`);
      continue;
    }

    // Kick off the plan
    console.log(`Activating plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}) at ${new Date(now).toISOString()}`);
    const planPromise = executePlan(job, glmPrice)
      .finally(() => {
        activePlans.delete(job.node_id);
      });
    activePlans.set(job.node_id, planPromise);
  }
}
