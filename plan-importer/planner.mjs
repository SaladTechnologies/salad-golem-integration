import { createReadStream } from 'fs';
import { promises as fsp } from 'fs';
import csv from 'csv-parser';
import config from 'config';
import timespan from 'timespan-parser';
import { plansDb } from './db.mjs';

// CSV column keys
const CSV_KEYS = {
  SLUG: 'key.0',
  NODE_ID: 'key.1',
  START_AT: 'value.0',
  STOP_AT: 'value.1',
  INVOICE_AMOUNT: 'value.2',
  GPU_CLASS_ID: 'value.5'
}

/**
 * Import plans into the database.
 */
async function importPlans() {

  // Ensure tables exist
  await plansDb.exec(`
    CREATE TABLE IF NOT EXISTS csv_import_file (
      id INTEGER PRIMARY KEY,
      file_name TEXT UNIQUE
    )
  `);

  await plansDb.exec(`
    CREATE TABLE IF NOT EXISTS node_plan (
      id INTEGER PRIMARY KEY,
      node_id TEXT,
      csv_import_file_id INTEGER,
      start_at INTEGER,
      stop_at INTEGER,
      invoice_amount REAL,
      usd_per_hour REAL,
      gpu_class_id TEXT,
      FOREIGN KEY (csv_import_file_id) REFERENCES csv_import_file(id)
    )
  `);

  await plansDb.exec(`
    CREATE TABLE IF NOT EXISTS node_plan_job (
      node_plan_id INTEGER,
      order_index INTEGER,
      start_at INTEGER,
      duration INTEGER,
      FOREIGN KEY (node_plan_id) REFERENCES node_plan(id)
    )
  `);

  // Get minimum and maximum duration from config
  const timespanParser = timespan({ unit: 'ms' });
  const minimumDuration = timespanParser.parse(config.get('minimumDuration'));
  const maximumDuration = timespanParser.parse(config.get('maximumDuration'));

  // Get organization whitelist from config
  const orgWhitelist = config.get('orgWhitelist');

  // Process all CSV files in the pending directory
  const pendingDir = 'data/pending';
  const importedDir = 'data/imported';
  const failedDir = 'data/failed';

  // Ensure pending directory exists
  await fsp.mkdir(pendingDir, { recursive: true });

  // Ensure imported directory exists
  await fsp.mkdir(importedDir, { recursive: true });

  // Ensure failed directory exists
  await fsp.mkdir(failedDir, { recursive: true });

  // Read CSV files
  const files = (await fsp.readdir(pendingDir)).filter(f => f.endsWith('.csv'));
  console.log(`Found ${files.length} CSV files to process.`);

  // Process each CSV file
  for (const csvFile of files) {
    console.log(`Processing file: ${csvFile}`);

    const csvFilePath = `${pendingDir}/${csvFile}`;
    const rows = [];
    let importSuccess = true;

    // Read CSV and collect rows
    await new Promise((resolve, reject) => {
      createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
          const totalDuration = row[CSV_KEYS.STOP_AT] - row[CSV_KEYS.START_AT];
          if (totalDuration >= minimumDuration) {
            rows.push(row);
          }
        })
        .on('end', resolve)
        .on('error', (err) => {
          importSuccess = false;
          reject(err);
        });
    }).catch((err) => {
      console.error(`Failed to read ${csvFile}:`, err);
      importSuccess = false;
    });

    if (importSuccess) {
      await plansDb.run('BEGIN TRANSACTION');

      try {
        // Insert CSV file record
        const insertCsvFile = await plansDb.prepare(`
          INSERT INTO csv_import_file (file_name) VALUES (?)
        `);
        const csvFileResult = await insertCsvFile.run(csvFile);
        const csvFileId = csvFileResult.lastID;

        // Prepare plan insert statement
        const insertPlan = await plansDb.prepare(`
          INSERT INTO node_plan (
            node_id,
            csv_import_file_id,
            start_at,
            stop_at,
            invoice_amount,
            usd_per_hour,
            gpu_class_id
          ) VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `);

        // Prepare job insert statement
        const insertJob = await plansDb.prepare(`
          INSERT INTO node_plan_job (
            node_plan_id,
            order_index,
            start_at,
            duration
          ) VALUES (
            ?,
            ?,
            ?,
            ?
          )
        `);

        // Insert plans and jobs
        for (const row of rows) {
          const slug = row[CSV_KEYS.SLUG];
          // Skip if slug does not match any whitelist prefix
          if (orgWhitelist.length > 0 && !orgWhitelist.some(prefix => slug.startsWith(prefix))) {
            continue;
          }

          // Calculate USD per hour rate
          const totalInvoiceAmount = row[CSV_KEYS.INVOICE_AMOUNT];
          let totalDuration = row[CSV_KEYS.STOP_AT] - row[CSV_KEYS.START_AT];
          const usdPerHour = (totalInvoiceAmount / totalDuration) * 3600000;

          // Insert plan
          const result = await insertPlan.run(
            row[CSV_KEYS.NODE_ID],
            csvFileId,
            row[CSV_KEYS.START_AT],
            row[CSV_KEYS.STOP_AT],
            row[CSV_KEYS.INVOICE_AMOUNT],
            usdPerHour,
            row[CSV_KEYS.GPU_CLASS_ID]
          );

          // Calculate job parameters
          let remainingDuration = totalDuration;
          let orderIndex = 0;
          let jobStartAt = parseInt(row[CSV_KEYS.START_AT]);

          // Split into jobs based on maximumDuration
          do {
            // Calculate job duration
            const jobDuration = Math.min(remainingDuration, maximumDuration);

            // Insert job if it meets minimum duration
            if (jobDuration >= minimumDuration) {
              await insertJob.run(
                result.lastID,
                orderIndex++,
                jobStartAt,
                jobDuration
              );
            }

            // Decrease remaining duration
            remainingDuration -= jobDuration;

            // Update job start time
            jobStartAt += jobDuration;
          } while (remainingDuration > 0);
        }

        // Finalize statements and commit transaction
        await insertCsvFile.finalize();
        await insertPlan.finalize();
        await insertJob.finalize();
        await plansDb.run('COMMIT');
        console.log(`${csvFile} successfully processed and rows inserted efficiently`);

        // Move file to imported/
        await fsp.rename(csvFilePath, `${importedDir}/${csvFile}`);
      } catch (err) {
        await plansDb.run('ROLLBACK');
        console.error(`Error importing ${csvFile}:`, err);

        // Move file to failed/
        await fsp.rename(csvFilePath, `${failedDir}/${csvFile}`);
      }
    } else {
      // Move file to failed/
      await fsp.rename(csvFilePath, `${failedDir}/${csvFile}`);
    }
  }
}

export { importPlans };
