import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import config from 'config';

// Open the database once and share it
const db = await open({
  filename: config.get('databaseFilePath'),
  driver: sqlite3.Database
});

// Enable WAL mode for better concurrency
await db.exec('PRAGMA journal_mode = WAL;');

export default db;
