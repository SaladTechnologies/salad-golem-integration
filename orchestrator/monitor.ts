import config from 'config';
import timespan from 'timespan-parser';
import { logger } from './logger.js';
import { plansDb } from './db.js';
import { getGpuClasses } from './matrix.js';
import { executePlan } from './executor.js';
import { deprovisionNode } from './provider.js';
import { k8sApi, k8sProviderNamespace } from './k8s.js';
import { getAdjustedNow } from './time.js';
import { GolemAbortError, GolemTimeoutError, GolemWorkError } from '@golem-sdk/golem-js';

// Track active plans to prevent overlapping executions
export let activePlans = new Map<string, Promise<void>>();

// Track failed plans to avoid repeated failures
let failedPlans = new Set<number>();

// Cache GPU classes to minimize API calls
let gpuClasses: any[] = [];

/**
 * Process plans that are due to start.
 */
export async function processPlans(): Promise<void> {
  // Subtract time lag from config
  const timespanParser = timespan({ unit: 'ms' });
  const minimumDuration = timespanParser.parse(config.get('minimumDuration'));

  const jobs = await plansDb.all<any[]>(`
    SELECT
      np.node_id,
      np.org_name,
      np.usd_per_hour,
      np.gpu_class_id,
      npj.node_plan_id,
      npj.order_index,
      npj.start_at + npj.duration - $adjustedNow AS adjusted_duration,
      npj.duration
    FROM node_plan_job npj
    JOIN node_plan np ON np.id = npj.node_plan_id
    WHERE $adjustedNow > npj.start_at
      AND $adjustedNow < npj.start_at + npj.duration
      AND npj.start_at + npj.duration - $adjustedNow > $minimumDuration`,
    {
      $adjustedNow: getAdjustedNow(),
      $minimumDuration: minimumDuration,
    }
  );

  logger.info(`Found ${jobs.length} plans to process`);
  logger.info(`Currently running ${activePlans.size} active jobs`);

  // Skip if no jobs
  if (jobs.length === 0) {
    return;
  }

  // Fetch GPU classes from Matrix
  if (gpuClasses.length === 0) {
    try {
      gpuClasses = await getGpuClasses();
    } catch (err) {
      logger.error('Error fetching GPU classes:');
    }
  }
  const gpuClassMap = new Map(gpuClasses.map((gc: any) => [gc.uuid, gc]));

  const maxConcurrentJobs = config.get<number>('maxConcurrentJobs');
  const organizationWhitelist = config.get<string[]>('organizationWhitelist');

  for (const job of jobs) {
    // Skip if already processing
    if (activePlans.has(job.node_id)) {
      logger.debug(`Plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}) is already active. Skipping.`);
      continue;
    }

    // Check organization whitelist
    if (organizationWhitelist.length > 0 && !organizationWhitelist.includes(job.org_name)) {
      logger.debug(`Organization ${job.org_name} is not in the whitelist. Skipping plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}).`);
      continue;
    }

    // Enforce max concurrent jobs
    if (maxConcurrentJobs > 0 && activePlans.size >= maxConcurrentJobs) {
      logger.debug(`Maximum concurrent jobs reached (${maxConcurrentJobs}). Skipping plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}).`);
      continue;
    }

    // Skip if this plan has previously failed
    if (failedPlans.has(job.node_plan_id)) {
      logger.debug(`Plan_id=${job.node_plan_id} has previously failed. Skipping.`);
      continue;
    }

    // Kick off the plan
    logger.info(`Activating plan for node_id=${job.node_id} (plan_id=${job.node_plan_id})}`);
    const planPromise = executePlan(job, gpuClassMap)
      .catch(async (err: any) => {
        logger.error(`Error executing plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}):`, err);
        console.error(err);

        // Mark plan as failed if not aborted or runtime timeout
        if (!(err instanceof GolemAbortError || (err instanceof GolemWorkError && err?.previous instanceof GolemTimeoutError))) {
          failedPlans.add(job.node_plan_id);
        }

        // Deprovision the provider node on failure
        try {
          logger.info(`Deprovisioning provider node-${job.node_id} during shutdown...`);
          await deprovisionNode(k8sApi, k8sProviderNamespace, { name: `node-${job.node_id}`, environment: {}, presets: {}, offerTemplate: {} });
          logger.info(`Deprovisioned provider node-${job.node_id} during shutdown.`);
        } catch (err) {
          logger.error(`Error while waiting for provider node-${job.node_id} during shutdown:`);
        }
      })
      .finally(() => {
        activePlans.delete(job.node_id);
      });
    activePlans.set(job.node_id, planPromise);
  }
}
