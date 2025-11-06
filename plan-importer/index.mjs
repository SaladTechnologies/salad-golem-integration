import { importPlans } from './planner.mjs';
import { plansDb } from './db.mjs';

// Execute the import process
await importPlans();

// Close the database connection
await plansDb.close();
