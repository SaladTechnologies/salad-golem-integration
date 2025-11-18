import { getGlmPrice } from './fetcher.mjs';
import { pricesDb } from './db.mjs';
import { logger } from './logger.mjs';

// Initial fetch and store
await fetchAndStorePrice();

// Schedule to run every 5 minutes
setInterval(fetchAndStorePrice, 300000); // Run every 5 minutes (300000 milliseconds)

async function fetchAndStorePrice() {
  try {
    // Fetch the GLM/USD price
    const glmPrice = await getGlmPrice();

    // Put the price into a database
    await pricesDb.exec(`
      CREATE TABLE IF NOT EXISTS glm_price (
        id INTEGER PRIMARY KEY,
        fetched_at INTEGER DEFAULT (strftime('%s','now')),
        price_usd REAL
      )
    `);

    await pricesDb.run(
      'INSERT INTO glm_price (price_usd) VALUES (?)',
      glmPrice
    );

    logger.info(`Inserted GLM price $${glmPrice} into database.`);

    // Close the database connection
    await pricesDb.close();
  } catch (error) {
    logger.error('Error in fetchAndStorePrice:', error.message);
  }
}
