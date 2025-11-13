import { processPlans } from './monitor.js';
import { nodesDb, plansDb, pricesDb } from './db.js';
import { glm, shutdown } from './glm.js';

// Handle graceful shutdown
process.on('SIGINT', () => shutdownHandler('SIGINT'));
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

// Connect to Golem Network
await glm.connect();

// Initial plan processing on startup
await processPlans();

// Schedule plan processing every minute
let runnerInterval = setInterval(processPlans, 1000 * 60);

function shutdownHandler(signal: string) {
	// Clear interval
	clearInterval(runnerInterval);

	// Abort any ongoing Golem operations
	shutdown.abort();

	// Disconnect from Golem Network
	glm.disconnect();

	// Close DB connections
	Promise
		.all([
			nodesDb.close(),
			plansDb.close(),
			pricesDb.close()
		])
		.then(() => {
			console.log(`Received ${signal}. Cleared interval, closed DBs, and exiting.`);
			process.exit(0);
		});
}
