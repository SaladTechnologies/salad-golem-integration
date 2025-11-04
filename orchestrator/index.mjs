
import { processPlans } from './monitor.mjs';
import { plansDb } from './db.mjs';
import { glm, shutdown } from './glm.mjs';

// Handle graceful shutdown
process.on('SIGINT', () => shutdownHandler('SIGINT'));
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

// Connect to Golem Network
await glm.connect();

// Initial plan processing on startup
await processPlans();

// Schedule plan processing every minute
let runnerInterval = setInterval(processPlans, 1000 * 60);

function shutdownHandler(signal) {
  // Clear interval
  clearInterval(runnerInterval);

  // Abort any ongoing Golem operations
  shutdown.abort();

  // Disconnect from Golem Network
  glm.disconnect();

  // Close DB connection
  plansDb.close()
    .then(() => {
      console.log(`Received ${signal}. Cleared interval, closed DB, and exiting.`);
      process.exit(0);
    });
}
