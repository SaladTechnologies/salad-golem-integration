import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import config from 'config';

// Open the database once and share it
export const plansDb: Database = await open({
  filename: config.get<string>('plansDatabaseFilePath'),
  driver: sqlite3.Database,
  mode: sqlite3.OPEN_READONLY
});

// Enable WAL mode for better concurrency
await plansDb.exec('PRAGMA journal_mode = WAL;');

export const pricesDb: Database = await open({
  filename: config.get<string>('pricesDatabaseFilePath'),
  driver: sqlite3.Database,
  mode: sqlite3.OPEN_READONLY
});

await pricesDb.exec('PRAGMA journal_mode = WAL;');

export const nodesDb: Database = await open({
  filename: config.get<string>('nodesDatabaseFilePath'),
  driver: sqlite3.Database
});

await nodesDb.exec('PRAGMA journal_mode = WAL;');

// Ensure node_wallets table exists
await nodesDb.exec(`
  CREATE TABLE IF NOT EXISTS node_wallets (
    node_id TEXT PRIMARY KEY,
    wallet_address TEXT,
    wallet_mnemonic TEXT
  )
`);
