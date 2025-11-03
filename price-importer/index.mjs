import { getGlmPrice } from './fetcher.mjs';
import db from './db.mjs';

// Fetch the GLM/USD price
const glmPrice = await getGlmPrice();

// Put the price into a database
await db.exec(`
  CREATE TABLE IF NOT EXISTS glm_price (
    id INTEGER PRIMARY KEY,
    fetched_at INTEGER DEFAULT (strftime('%s','now')),
    price_usd REAL
  )
`);

await db.run(
  'INSERT INTO glm_price (price_usd) VALUES (?)',
  glmPrice
);

console.log(`Inserted GLM price $${glmPrice} into database.`);
