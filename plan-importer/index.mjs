import { fetchMixpanelJql } from './mixpanel.mjs';
import { importPlans } from './planner.mjs';
import { exportToPostgres } from './export-postgres.mjs';
import { plansDb } from './db.mjs';
import { logger } from './logger.mjs';

// Handle graceful shutdown
process.on('SIGINT', () => shutdownHandler('SIGINT'));
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

async function shutdownHandler(signal) {
  logger.info(`Received ${signal}, shutting down...`);
  await plansDb.close();
  process.exit(0);
}

/**
 * Trigger PostgreSQL export in a non-blocking way.
 * Logs success or failure without blocking the main process.
 */
function triggerPostgresExport() {
  exportToPostgres()
    .then(() => {
      logger.info('PostgreSQL export completed successfully');
    })
    .catch((error) => {
      logger.error('PostgreSQL export failed:', error);
    });
}

// Fetch data from MixPanel JQL API
await fetchMixpanelJql();

// Execute the import process
await importPlans();

// Export to PostgreSQL (non-blocking)
triggerPostgresExport();

// Schedule periodic imports every 6 hours
setInterval(async () => {
  try {
    // Fetch data from MixPanel JQL API
    await fetchMixpanelJql();

    // Execute the import process
    await importPlans();

    // Export to PostgreSQL (non-blocking)
    triggerPostgresExport();
  } catch (error) {
    logger.error('Error importing plans:', error);
  }
}, 6 * 60 * 60 * 1000); // Every 6 hours
