import { fetchMixpanelJql } from './mixpanel.mjs';
import { importPlans } from './planner.mjs';
import { plansDb } from './db.mjs';

// Handle graceful shutdown
process.on('SIGINT', () => shutdownHandler('SIGINT'));
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

async function shutdownHandler(signal) {
  logger.info(`Received ${signal}, shutting down...`);
  await plansDb.close();
  process.exit(0);
}

// Fetch data from MixPanel JQL API
await fetchMixpanelJql();

// Execute the import process
await importPlans();

// Schedule periodic imports every 6 hours
setInterval(async () => {
  try {
    // Fetch data from MixPanel JQL API
    await fetchMixpanelJql();

    // Execute the import process
    await importPlans();
  } catch (error) {
    logger.error('Error importing plans:', error);
  }
}, 6 * 60 * 60 * 1000); // Every 6 hours
