import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import config from 'config';

// Open the database once and share it
const plansDb = await open({
  filename: config.get('plansDatabaseFilePath'),
  driver: sqlite3.Database
});

// Enable WAL mode for better concurrency
await plansDb.exec('PRAGMA journal_mode = WAL;');

// Open the database once and share it
const pricesDb = await open({
  filename: config.get('pricesDatabaseFilePath'),
  driver: sqlite3.Database
});

// Enable WAL mode for better concurrency
await pricesDb.exec('PRAGMA journal_mode = WAL;');

// Open the database once and share it
const nodesDb = await open({
  filename: config.get('nodesDatabaseFilePath'),
  driver: sqlite3.Database
});

// Enable WAL mode for better concurrency
await nodesDb.exec('PRAGMA journal_mode = WAL;');

// Ensure node_wallets table exists
await nodesDb.exec(`
  CREATE TABLE IF NOT EXISTS node_wallets (
    node_id TEXT PRIMARY KEY,
    wallet_address TEXT,
    wallet_mnemonic TEXT
  )
`);

export { plansDb, pricesDb, nodesDb };
