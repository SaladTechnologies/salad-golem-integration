# Plan Importer

## Overview
The Plan Importer is a Node.js module designed to process and import computational plans from CSV files into a SQLite database. These plans are used to schedule and manage node jobs for distributed computing tasks.

## How Plans Are Created
1. **CSV Format**: Plans are defined in CSV files located in the `data/pending` directory. Each CSV file contains rows representing individual node jobs, with columns for node ID, start time, stop time, invoice amount, GPU class, and other relevant fields.

2. **Pending Folder**: New plan CSVs should be placed in the `data/pending` folder. The importer will process all files in this folder.

3. **Import Process**:
   - The importer reads each CSV file in the `data/pending` directory.
   - For each row, it validates the duration and other constraints.
   - Valid jobs are inserted into the `node_plan` and `node_plan_job` tables in the SQLite database.
   - After successful import, the CSV file is moved to the `data/imported` folder. If import fails, it is moved to `data/failed`.

4. **Database Schema**:
   - `node_plan`: Stores plan metadata (node ID, start/stop times, GPU class, etc.).
   - `node_plan_job`: Stores individual jobs linked to a plan, including order, duration, and invoice amount.

## Usage
1. Place your plan CSV files in `data/pending`.
2. Run the importer (usually via a scheduled or manual process).
3. Check `data/imported` for successfully processed files and `data/failed` for any errors.

## Example CSV Row
```
key.1,value.0,value.1,value.2,value.5
node123,1698600000,1698603600,10.5,RTX3090
```
- `key.1`: Node ID
- `value.0`: Start time (Unix timestamp)
- `value.1`: Stop time (Unix timestamp)
- `value.2`: Invoice amount
- `value.5`: GPU class ID

## Requirements
- Node.js
- SQLite
- Required npm packages (see package.json)

---

## Running with Docker

1. **Build the Docker image:**
   ```sh
   docker build -t plan-importer .
   ```

2. **Run the container:**
   ```sh
   docker run --rm \
     -e DATA_DIRECTORY=/path/to/data \
     -e MIXPANEL_API_KEY=your_mixpanel_api_key \
     -e PLANS_DATABASE_FILE_PATH=/path/to/data/plans.db \
     plan-importer
   ```

## Required Environment Variables

These environment variables must be set for the app to run:

- `DATA_DIRECTORY`: Path to the data directory used by the importer.
- `MIXPANEL_API_KEY`: API key for Mixpanel integration.
- `PLANS_DATABASE_FILE_PATH`: Path to the plans database file.

You can set these variables in your shell, in a `.env` file, or directly in the Docker run command as shown above.

## Project Structure
- `index.mjs` — Main entry point
- `planner.mjs` — Plan import logic
- `db.mjs` — Database logic
- `config/` — Configuration files
- `jql/` — JQL query files
- `Dockerfile` — Docker configuration

## Example
```sh
docker run --rm \
  -e DATA_DIRECTORY=/data \
  -e MIXPANEL_API_KEY=abc123 \
  -e PLANS_DATABASE_FILE_PATH=/data/plans.db \
  plan-importer
```

## Notes
- Only files in `data/pending` are processed.
- Files are moved to `imported` or `failed` after processing.
- Minimum and maximum duration constraints are configurable.

---
For more details, see the code in `planner.mjs`.
