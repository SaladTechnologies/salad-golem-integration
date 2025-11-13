
import config from 'config';
import timespan from 'timespan-parser';
import { plansDb } from './db.mjs';
import { getGpuClasses } from './matrix.mjs';

// Track active plans to prevent overlapping executions
let activePlans = new Map();

/**
 * Process plans that are due to start.
 */
export async function processPlans() {
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
    JOIN node_plan np ON np.id = npj.node_plan_id
    WHERE $adjustedNow > npj.start_at
      AND $adjustedNow < npj.start_at + npj.duration
      AND npj.start_at + npj.duration - $adjustedNow > $minimumDuration
  `, {
    $adjustedNow: adjustedNow,
    $minimumDuration: minimumDuration,
  });

  console.log(`Processing ${jobs.length} due jobs at ${new Date(now).toISOString()}`);

  // Skip if no jobs
  if (jobs.length === 0) {
    return;
  }

  // Fetch GPU classes from Matrix
  const gpuClasses = await getGpuClasses();
  const gpuClassMap = new Map(gpuClasses.map(gc => [gc.uuid, gc]));

  const maxConcurrentJobs = config.get('maxConcurrentJobs');
  const organizationWhitelist = config.get('organizationWhitelist');

  for (const job of jobs) {
    // Skip if already processing
    if (activePlans.has(job.node_id)) {
      console.log(`Plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}) is already active. Skipping.`);
      continue;
    }

    // Check organization whitelist
    if (organizationWhitelist.length > 0 && !organizationWhitelist.includes(job.org_name)) {
      console.log(`Organization ${job.org_name} is not in the whitelist. Skipping plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}).`);
      continue;
    }

    // Enforce max concurrent jobs
    if (maxConcurrentJobs > 0 && activePlans.size >= maxConcurrentJobs) {
      console.log(`Maximum concurrent jobs reached (${maxConcurrentJobs}). Skipping plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}).`);
      continue;
    }

    // Kick off the plan
    console.log(`Activating plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}) at ${new Date(now).toISOString()}`);
    const planPromise = executePlan(job, gpuClassMap)
      .catch((err) => {
        console.error(`Error executing plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}):`, err);
      })
      .finally(() => {
        activePlans.delete(job.node_id);
      });
    activePlans.set(job.node_id, planPromise);
  }
}
