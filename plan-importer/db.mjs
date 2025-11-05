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

export { plansDb };
