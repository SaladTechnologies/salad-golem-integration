import { activePlans, processPlans } from './monitor.js';
import { nodesDb, plansDb, pricesDb } from './db.js';
import { glm, shutdown } from './glm.js';
import { logger } from './logger.js';
import { k8sApi, k8sProviderNamespace } from './k8s.js';
import { deprovisionNode } from './provider.js';

// Handle graceful shutdown
process.on('SIGINT', () => shutdownHandler('SIGINT'));
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

// Connect to Golem Network
await glm.connect();

// Initial plan processing on startup
await processPlans();

// Schedule plan processing every minute
let runnerInterval = setInterval(processPlans, 1000 * 60);

async function shutdownHandler(signal: string) {
  // Clear interval
  clearInterval(runnerInterval);

  // Abort any ongoing Golem operations
  shutdown.abort();

  // Disconnect from Golem Network
  await glm.disconnect();

  console.log('Disconnected from Golem Network.');

  // Deprovision all active provider nodes
  for (const [planKey] of activePlans) {
    try {
      logger.info(`Devprovisioning provider node-${planKey} during shutdown...`);
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
