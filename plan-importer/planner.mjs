import { promises as fsp } from 'fs';
import config from 'config';
import timespan from 'timespan-parser';
import { plansDb } from './db.mjs';

// JSON array keys
const JSON_KEYS = {
  ORG_NAME: 0,
  NODE_ID: 2,
  START_AT: 0,
  STOP_AT: 1,
  INVOICE_AMOUNT: 2,
  GPU_CLASS_ID: 5
}

/**
 * Import plans into the database.
 */
async function importPlans() {

  // Ensure tables exist
  await plansDb.exec(`
    CREATE TABLE IF NOT EXISTS json_import_file (
      id INTEGER PRIMARY KEY,
      file_name TEXT UNIQUE
    )
  `);

  await plansDb.exec(`
    CREATE TABLE IF NOT EXISTS node_plan (
      id INTEGER PRIMARY KEY,
      org_name TEXT,
      node_id TEXT,
      json_import_file_id INTEGER,
      start_at INTEGER,
      stop_at INTEGER,
      invoice_amount REAL,
      usd_per_hour REAL,
      gpu_class_id TEXT,
      FOREIGN KEY (json_import_file_id) REFERENCES json_import_file(id)
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

  // Process all JSON files in the pending directory
  const pendingDir = `${config.get('dataDirectory')}/pending`;
  const importedDir = `${config.get('dataDirectory')}/imported`;
  const failedDir = `${config.get('dataDirectory')}/failed`;

  // Ensure pending directory exists
  await fsp.mkdir(pendingDir, { recursive: true });

  // Ensure imported directory exists
  await fsp.mkdir(importedDir, { recursive: true });

  // Ensure failed directory exists
  await fsp.mkdir(failedDir, { recursive: true });

  // Read JSON files
  const files = (await fsp.readdir(pendingDir)).filter(f => f.endsWith('.json'));
  console.log(`Found ${files.length} JSON files to process.`);

  // Process each JSON file
  for (const jsonFile of files) {
    console.log(`Processing file: ${jsonFile}`);
    const jsonFilePath = `${pendingDir}/${jsonFile}`;
    let importSuccess = true;

    // Open the JSON file and parse its content
    const fileContent = await fsp.readFile(jsonFilePath, 'utf-8');
    let jsonData;
    try {
      jsonData = JSON.parse(fileContent);
    } catch (err) {
      console.error(`Failed to parse JSON in ${jsonFile}:`, err);
      importSuccess = false;

      // Move file to failed/
      await fsp.rename(jsonFilePath, `${failedDir}/${jsonFile}`);
      continue;
    }

    if (importSuccess) {
      await plansDb.run('BEGIN TRANSACTION');

      try {
        // Insert JSON file record
        const insertJsonFile = await plansDb.prepare(`
          INSERT INTO json_import_file (file_name) VALUES (?)
        `);
        const jsonFileResult = await insertJsonFile.run(jsonFile);
        const jsonFileId = jsonFileResult.lastID;

        // Prepare plan insert statement
        const insertPlan = await plansDb.prepare(`
          INSERT INTO node_plan (
            org_name,
            node_id,
            json_import_file_id,
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
        for (const row of jsonData) {
          // If less than minimum duration, skip
          if ((row.value[JSON_KEYS.STOP_AT] - row.value[JSON_KEYS.START_AT]) < minimumDuration) {
            continue;
          }

          // Calculate USD per hour rate
          const totalInvoiceAmount = row.value[JSON_KEYS.INVOICE_AMOUNT];
          let totalDuration = row.value[JSON_KEYS.STOP_AT] - row.value[JSON_KEYS.START_AT];
          const usdPerHour = (totalInvoiceAmount / totalDuration) * 3600000;

          // Insert plan
          const result = await insertPlan.run(
            row.key[JSON_KEYS.ORG_NAME],
            row.key[JSON_KEYS.NODE_ID],
            jsonFileId,
            row.value[JSON_KEYS.START_AT],
            row.value[JSON_KEYS.STOP_AT],
            row.value[JSON_KEYS.INVOICE_AMOUNT],
            usdPerHour,
            row.value[JSON_KEYS.GPU_CLASS_ID]
          );

          // Calculate job parameters
          let remainingDuration = totalDuration;
          let orderIndex = 0;
          let jobStartAt = parseInt(row.value[JSON_KEYS.START_AT]);

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
        await insertJsonFile.finalize();
        await insertPlan.finalize();
        await insertJob.finalize();
        await plansDb.run('COMMIT');
        console.log(`${jsonFile} successfully processed and rows inserted efficiently`);
        // Move file to imported/
        await fsp.rename(jsonFilePath, `${importedDir}/${jsonFile}`);
      } catch (err) {
        await plansDb.run('ROLLBACK');
        console.error(`Error importing ${jsonFile}:`, err);

        // Move file to failed/
        await fsp.rename(jsonFilePath, `${failedDir}/${jsonFile}`);
      }
    } else {
      // Move file to failed/
      await fsp.rename(jsonFilePath, `${failedDir}/${jsonFile}`);
    }
  }
}

export { importPlans };
