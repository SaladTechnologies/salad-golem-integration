import { fetchMixpanelJql } from './mixpanel.mjs';
import { importPlans } from './planner.mjs';
import { plansDb } from './db.mjs';

// Fetch data from MixPanel JQL API
await fetchMixpanelJql();

// Execute the import process
await importPlans();

// Close the database connection
await plansDb.close();
