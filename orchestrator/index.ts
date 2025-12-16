import { activePlans, processPlans, provisionRequestors, requestors } from './monitor.js';
import { nodesDb, plansDb, pricesDb } from './db.js';
import { shutdown } from './glm.js';
import { logger } from './logger.js';
import { k8sApi, k8sProviderNamespace } from './k8s.js';
import { deprovisionNode } from './provider.js';
import { reapUnusedResources } from './reaper.js';
import { scheduleTask } from './helpers.js';

// Handle graceful shutdown
process.on('SIGINT', () => shutdownHandler('SIGINT'));
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

// Provision requestors in the background
provisionRequestors();

// Schedule plan processing every minute
let runnerInterval = setInterval(processPlans, 1000 * 60);

// Schedule reaping of unused resources every 2.5 minutes
scheduleTask(async () => {
  try {
    await reapUnusedResources();
  } catch (err) {
    logger.error(err, 'Error during unused resource reaping:');
  }
}, 1000 * 60 * 2.5);

async function shutdownHandler(signal: string) {
  // Clear interval
  clearInterval(runnerInterval);

  // Abort any ongoing Golem operations
  shutdown.abort();

  // Disconnect from Golem Network
  for (const [requestorKey, requestor] of requestors) {
    try {
      await requestor.client.disconnect();
    } catch (err) {
      logger.error(err, `Error disconnecting requestor ${requestorKey}:`);
    }
  }

  logger.info('Disconnected from Golem Network.');

  // Deprovision all active provider nodes
  for (const [planKey] of activePlans) {
    try {
      logger.info(`Deprovisioning provider node-${planKey} during shutdown...`);
      await deprovisionNode(k8sApi, k8sProviderNamespace, { name: `node-${planKey}`, environment: {}, presets: {}, offerTemplate: {} });
      logger.info(`Deprovisioned provider node-${planKey} during shutdown.`);
    } catch (err) {
      logger.error(`Error while waiting for provider node-${planKey} during shutdown:`);
    }
  }

  // Close DB connections
  await Promise.all([
    nodesDb.close(),
    plansDb.close(),
    pricesDb.close()
  ]);

  logger.info(`Received ${signal}. Cleared interval, closed DBs, and exiting.`);

  // Flush logger
  logger.flush();

  // Exit process
  process.exit(0);
}
