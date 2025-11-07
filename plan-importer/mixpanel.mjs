import fs from 'fs/promises';
import config from 'config';

// Function to fetch data from MixPanel JQL API for the previous two days
export async function fetchMixpanelJql() {
  // Function to get the previous n day ranges
  function getPreviousDayRanges(n, baseDate = new Date()) {
    const pad = x => x.toString().padStart(2, '0');
    const formatCompact = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const formatDashed = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    // Generate n ranges, each for a single day, ending at baseDate - 1 day
    // e.g. for n=2 and baseDate=2025-11-07, get [2025-11-04 to 2025-11-05], [2025-11-05 to 2025-11-06]
    const result = [];
    for (let i = n + 1; i >= 2; i--) {
      const start = new Date(baseDate);
      start.setDate(baseDate.getDate() - i);
      const end = new Date(baseDate);
      end.setDate(baseDate.getDate() - (i - 1));
      result.push({
        filename: `${formatCompact(start)}-${formatCompact(end)}.json`,
        start: formatDashed(start),
        end: formatDashed(end)
      });
    }
    return result;
  }

  // Get the previous two day ranges
  const ranges = getPreviousDayRanges(2);

  for (const { filename, start, end } of ranges) {
    // If the file already exists in the imported folder, skip it
    try {
      const importedPath = `${config.get('dataDirectory')}/imported/${filename}`;
      await fs.access(importedPath);
      console.log(`File ${filename} already exists in imported folder. Skipping.`);
      continue;
    } catch (err) {
      // File does not exist in imported, continue
    }

    console.log(`Fetching data for ${filename} from MixPanel JQL API...`);

    // Read in the JQL query from a file
    const jqlQuery = await fs.readFile('./jql/earnings-query.jql', 'utf-8');

    const encodedParams = new URLSearchParams();
    encodedParams.set('script', jqlQuery);
    encodedParams.set('params', JSON.stringify({
      from_date: start,
      to_date: end,
      event_selectors: [{event: 'Workload Earning', selector: 'properties["InvoiceAmount"] > 0'}]
    }));

    const url = config.get('mixPanelJqlUrl');
    const options = {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        authorization: 'Basic ' + Buffer.from(`${config.get('mixPanelApiKey')}:`).toString('base64')
      },
      body: encodedParams
    };

    const response = await fetch(url, options);
    const data = await response.json();

    // Write the JSON into the pending folder
    await fs.writeFile(`${config.get('dataDirectory')}/pending/${filename}`, JSON.stringify(data, null, 2), 'utf-8');
  }
}
