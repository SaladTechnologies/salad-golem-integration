import pg from 'pg';
import config from 'config';
import { plansDb } from './db.mjs';
import { logger } from './logger.mjs';

const BATCH_SIZE = 5000;

/**
 * Get PostgreSQL connection pool.
 */
function getPgPool() {
  return new pg.Pool({
    host: config.get('postgres.host'),
    port: config.get('postgres.port'),
    database: config.get('postgres.database'),
    user: config.get('postgres.user'),
    password: config.get('postgres.password'),
  });
}

/**
 * Run migrations to create tables if they don't exist.
 */
async function runMigration(pgClient) {
  logger.info('Running migration for node_plan table...');

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS node_plan (
      id INTEGER PRIMARY KEY,
      org_name TEXT,
      node_id TEXT,
      json_import_file_id INTEGER,
      start_at BIGINT,
      stop_at BIGINT,
      invoice_amount DOUBLE PRECISION,
      usd_per_hour DOUBLE PRECISION,
      gpu_class_id TEXT,
      ram DOUBLE PRECISION,
      cpu DOUBLE PRECISION
    )
  `);

  // Create sequence if it doesn't exist
  await pgClient.query(`
    CREATE SEQUENCE IF NOT EXISTS node_plan_id_seq
  `);

  logger.info('Migration complete');
}

/**
 * Clear existing data from node_plan table.
 */
async function clearTables(pgClient) {
  logger.info('Clearing existing data...');
  await pgClient.query('TRUNCATE node_plan RESTART IDENTITY CASCADE');
  logger.info('Tables cleared');
}

/**
 * Import node_plan table from SQLite to PostgreSQL in batches.
 */
async function importNodePlan(pgClient) {
  logger.info('Importing node_plan...');

  // Get total count
  const countResult = await plansDb.get('SELECT COUNT(*) as count FROM node_plan');
  const totalRows = countResult.count;
  logger.info(`Total rows to import: ${totalRows}`);

  let imported = 0;
  let offset = 0;

  while (offset < totalRows) {
    // Fetch batch from SQLite
    const rows = await plansDb.all(`
      SELECT id, org_name, node_id, json_import_file_id, start_at, stop_at,
             invoice_amount, usd_per_hour, gpu_class_id, ram, cpu
      FROM node_plan
      LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `);

    if (rows.length === 0) break;

    // Build values for batch insert
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (const row of rows) {
      placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
      values.push(
        row.id,
        row.org_name,
        row.node_id,
        row.json_import_file_id,
        row.start_at,
        row.stop_at,
        row.invoice_amount,
        row.usd_per_hour,
        row.gpu_class_id,
        row.ram,
        row.cpu
      );
    }

    // Upsert batch
    await pgClient.query(`
      INSERT INTO node_plan (id, org_name, node_id, json_import_file_id, start_at, stop_at,
                             invoice_amount, usd_per_hour, gpu_class_id, ram, cpu)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        org_name = EXCLUDED.org_name,
        node_id = EXCLUDED.node_id,
        json_import_file_id = EXCLUDED.json_import_file_id,
        start_at = EXCLUDED.start_at,
        stop_at = EXCLUDED.stop_at,
        invoice_amount = EXCLUDED.invoice_amount,
        usd_per_hour = EXCLUDED.usd_per_hour,
        gpu_class_id = EXCLUDED.gpu_class_id,
        ram = EXCLUDED.ram,
        cpu = EXCLUDED.cpu
    `, values);

    imported += rows.length;
    offset += BATCH_SIZE;
    const progress = Math.floor((100 * imported) / totalRows);
    logger.info(`Progress: ${imported}/${totalRows} (${progress}%)`);
  }

  // Update sequence to max id
  await pgClient.query(`
    SELECT setval('node_plan_id_seq', (SELECT COALESCE(MAX(id), 1) FROM node_plan))
  `);

  logger.info(`Imported ${imported} rows`);
}

/**
 * Export SQLite plans.db to PostgreSQL.
 * @param {Object} options - Export options
 * @param {boolean} options.clear - Clear existing tables before import
 */
async function exportToPostgres(options = {}) {
  const { clear = false } = options;

  logger.info('='.repeat(50));
  logger.info('SQLite to PostgreSQL Export: plans.db');
  logger.info('='.repeat(50));

  const pool = getPgPool();
  const pgClient = await pool.connect();

  try {
    logger.info(`Connected to PostgreSQL at ${config.get('postgres.host')}`);

    // Run migration first
    await runMigration(pgClient);

    // Clear tables if requested
    if (clear) {
      await clearTables(pgClient);
    }

    // Import node_plan table
    await importNodePlan(pgClient);

    logger.info('='.repeat(50));
    logger.info('Export complete!');
    logger.info('='.repeat(50));
  } finally {
    pgClient.release();
    await pool.end();
  }
}

export { exportToPostgres };
