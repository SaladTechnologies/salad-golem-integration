import config from 'config';
import timespan from 'timespan-parser';
import retry from 'async-retry';
import { ethers } from 'ethers';
import { logger } from './logger.js';
import { plansDb } from './db.js';
import { getGpuClasses } from './matrix.js';
import { executePlan } from './executor.js';
import { deprovisionNode } from './provider.js';
import { provisionRequestor } from './requestor.js';
import { createGolemClient } from './glm.js';
import { execAndParseJson, k8sApi, k8sAppsApi, k8sProviderNamespace, k8sRequestorNamespace } from './k8s.js';
import { getAdjustedNow } from './time.js';
import { GolemAbortError, GolemNetwork, GolemTimeoutError, GolemWorkError } from '@golem-sdk/golem-js';
import { provisionRelay } from './relay.js';
import { Writable } from 'stream';

// Provisioned requestors
export let requestors: Map<string, any> = new Map();

// Track active plans to prevent overlapping executions
export let activePlans = new Map<string, Promise<void>>();

// Track failed plans to avoid repeated failures
let failedPlans = new Set<number>();

// Cache GPU classes to minimize API calls
let gpuClasses: any[] = [];

export async function provisionRequestors() {
  const walletKeys: string[] = config.get('requestorWalletKeys');

  // Get stateful sets in the requestor namespace
  const statefulSets = await k8sAppsApi.listNamespacedStatefulSet({ namespace: k8sRequestorNamespace });
  const statefulSetNames = statefulSets.items.map(ss => ss.metadata?.name).filter(name => name != null) as string[];

  let promises = [];  for (const privateKey of walletKeys) {
    promises.push(setupRequestorAndRelay(privateKey, statefulSetNames));
  }

  await Promise.all(promises);
}

async function setupRequestorAndRelay(privateKey: string, statefulSetNames: string[]) {
  try {
    // Get the public key from the wallet key
    const wallet = new ethers.Wallet(privateKey);
    const publicKey = await wallet.getAddress();

    const requestorKey = publicKey.toLowerCase().replace('0x', '');

    // Check if the relay stateful set already exists
    const expectedRelayName = `relay-${requestorKey}`;
    let relayExists = false;

    if (statefulSetNames.includes(expectedRelayName)) {
      logger.info(`Relay stateful set for wallet key: ${requestorKey} already exists. Skipping provisioning.`);
      relayExists = true;
    }

    if (!relayExists) {
      // Provision new relay
      logger.info(`Provisioning relay for wallet key: ${requestorKey}`);
      // Provision the relay in Kubernetes
      await provisionRelay(expectedRelayName);

      // Wait a moment for the relay to start
      await new Promise(resolve => setTimeout(resolve, 2 * 1000));
    }

    const relayUrl = `${expectedRelayName}-service.${k8sRequestorNamespace}.svc.cluster.local:7477`;
    logger.info(`Relay URL for wallet key ${requestorKey}: ${relayUrl}`);

    // Check if requestor pod already exists
    const expectedRequestorName = `requestor-${requestorKey}`;
    let requestorExists = false;

    if (statefulSetNames.includes(expectedRequestorName)) {
      logger.info(`Requestor stateful set for wallet key: ${requestorKey} already exists. Skipping provisioning.`);
      requestorExists = true;
    }

    if (!requestors.has(requestorKey)) {
      if (!requestorExists) {
        // Provision new requestor
        logger.info(`Provisioning requestor for wallet key: ${requestorKey}`);

        // Provision the requestor in Kubernetes
        await provisionRequestor(k8sApi, k8sRequestorNamespace, {
          name: expectedRequestorName,
          environment: {
            POLYGON_GETH_ADDR: "https://polygon.drpc.org",
            POLYGON_MAX_FEE_PER_GAS: config.get<number>('polygonMaxGasFeeGwei').toString(),
            YA_NET_RELAY_HOST: relayUrl,
            YA_NET_TYPE: 'hybrid',
            YAGNA_API_URL: 'http://0.0.0.0:7465',
            YAGNA_AUTOCONF_APPKEY: requestorKey,
            YAGNA_AUTOCONF_ID_SECRET: privateKey.replace('0x', ''),
          }
        });
      }

      const apiUrl = `http://${expectedRequestorName}-service.${k8sRequestorNamespace}.svc.cluster.local:7465`;
      logger.info(`Connecting to requestor API at ${apiUrl} for wallet key: ${requestorKey}`);

      // Create GolemNetwork requestor instance
      const client = createGolemClient<GolemNetwork>(apiUrl, requestorKey);

      // Connect to Golem Network
      // Use async retry to handle potential startup delays
      await retry(async () => {
        await client.connect();

        // Get the payment process info
        try {
          logger.info(`Fetching payment process info for requestor ${requestorKey}...`);

          const paymentProcessInfo = await execAndParseJson(
            k8sRequestorNamespace,
            `${expectedRequestorName}-0`,
            'yagna',
            [
              '/home/ubuntu/.local/bin/yagna',
              'payment',
              'process',
              'info',
              '--json'
            ]);

          // Find the payment process for the configured network
          const paymentNetwork: string = config.get('paymentNetwork');
          // Find the network info that starts with erc20-{paymentNetwork}
          const networkInfo = paymentProcessInfo.find((net: any) => net.platform.startsWith(`erc20-${paymentNetwork}`));

          if (networkInfo) {
            if (networkInfo.intervalSec != 1800 || networkInfo.extraPaymentTimeSec != 300) {
              logger.warn(`Payment process for requestor ${requestorKey} is not configured with the expected intervalSec (1800) and extraPaymentTimeSec (300). Current values: intervalSec=${networkInfo.intervalSec}, extraPaymentTimeSec=${networkInfo.extraPaymentTimeSec}`);

              const response = await execAndParseJson(
                k8sRequestorNamespace,
                `${expectedRequestorName}-0`,
                'yagna',
                [
                  '/home/ubuntu/.local/bin/yagna',
                  'payment',
                  'process',
                  'set',
                  '--network',
                  paymentNetwork,
                  '--interval',
                  '30m',
                  '--payout',
                  '5m',
                  '--json'
                ]);

              logger.info(`Updated payment process configuration for requestor ${requestorKey}: ${JSON.stringify(response)}`);
            }
            else {
              logger.info(`Payment process for requestor ${requestorKey} is correctly configured.`);
            }
          }
        } catch (err) {
          console.log(err);
          logger.error(err, `Error fetching payment process info for requestor ${requestorKey}:`);
        }
      }, {
        onRetry: (err, attempt) => {
          logger.warn(err, `Retrying connection to requestor API at ${apiUrl} for wallet key: ${requestorKey}. Attempt ${attempt}. Error:`);
        },
        retries: 5,
        minTimeout: 10000,
        maxTimeout: 30000,
      });

      const requestor = {
        client: client,
        relay: relayUrl,
        providerCount: 0
      };

      requestors.set(requestorKey, requestor);
      logger.info(`Provisioned requestor for wallet key: ${requestorKey}`);
    }
  } catch (err) {
    logger.error(err, `Error provisioning requestor for wallet key: ${privateKey}:`);
  }
}

/**
 * Process plans that are due to start.
 */
export async function processPlans(): Promise<void> {
  // Subtract time lag from config
  const timespanParser = timespan({ unit: 'ms' });
  const minimumDuration = timespanParser.parse(config.get('minimumDuration'));

  const jobs = await plansDb.all<any[]>(`
    SELECT
      np.node_id,
      np.org_name,
      np.usd_per_hour,
      np.gpu_class_id,
      npj.node_plan_id,
      npj.order_index,
      npj.start_at + npj.duration - $adjustedNow AS adjusted_duration,
      npj.duration
    FROM node_plan_job npj
    JOIN node_plan np ON np.id = npj.node_plan_id
    WHERE $adjustedNow > npj.start_at
      AND $adjustedNow < npj.start_at + npj.duration
      AND npj.start_at + npj.duration - $adjustedNow > $minimumDuration`,
    {
      $adjustedNow: getAdjustedNow(),
      $minimumDuration: minimumDuration,
    }
  );

  logger.info(`Found ${jobs.length} plans to process`);
  logger.info(`Currently running ${activePlans.size} active jobs`);

  // Skip if no jobs
  if (jobs.length === 0) {
    return;
  }

  if (requestors.size === 0) {
    logger.warn('No requestors available yet to process plans. Skipping plan processing.');
    return;
  }

  // Report requestor statuses
  for (const [key, requestor] of requestors.entries()) {
    logger.info(`Requestor ${key} - Providers: ${requestor.providerCount}`);
  }

  // Fetch GPU classes from Matrix
  if (gpuClasses.length === 0) {
    try {
      gpuClasses = await getGpuClasses();
    } catch (err) {
      logger.error('Error fetching GPU classes:');
    }
  }
  const gpuClassMap = new Map(gpuClasses.map((gc: any) => [gc.uuid, gc]));

  const maxConcurrentJobs = config.get<number>('maxConcurrentJobs');
  const organizationWhitelist = config.get<string[]>('organizationWhitelist');

  for (const job of jobs) {
    // Skip if already processing
    if (activePlans.has(job.node_id)) {
      logger.debug(`Plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}) is already active. Skipping.`);
      continue;
    }

    // Check organization whitelist
    if (!organizationWhitelist.includes(job.org_name)) {
      logger.debug(`Organization ${job.org_name} is not in the whitelist. Skipping plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}).`);
      continue;
    }

    // Enforce max concurrent jobs
    if (maxConcurrentJobs >= 0 && activePlans.size >= maxConcurrentJobs) {
      logger.debug(`Maximum concurrent jobs reached (${maxConcurrentJobs}). Skipping plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}).`);
      continue;
    }

    // Find a requestor with capacity
    let selectedRequestorKey: string | null = null;
    for (const [key, requestor] of requestors.entries()) {
      if (requestor.providerCount < config.get<number>('maxProvidersPerRequestor')) {
        selectedRequestorKey = key;
        requestor.providerCount += 1;
        break;
      }
    }

    if (!selectedRequestorKey) {
      logger.debug(`No requestor with available capacity found. Skipping plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}).`);
      continue;
    }

    // Kick off the plan, staggered by 0-55 seconds to avoid the thundering herd
    logger.info(`Activating plan for node_id=${job.node_id} (plan_id=${job.node_plan_id})}`);
    const randomDelay = Math.floor(Math.random() * 55000);
    const planPromise = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        executePlan(requestors.get(selectedRequestorKey), job, gpuClassMap)
          .catch(async (err: any) => {
            logger.error(`Error executing plan for node_id=${job.node_id} (plan_id=${job.node_plan_id}):`, err);
            console.error(err);

            // Mark plan as failed if not aborted or runtime timeout
            if (!(err instanceof GolemAbortError || (err instanceof GolemWorkError && err?.previous instanceof GolemTimeoutError))) {
              failedPlans.add(job.node_plan_id);
            }

            // Deprovision the provider node on failure
            try {
              logger.info(`Deprovisioning provider node-${job.node_id} during shutdown...`);
              await deprovisionNode(k8sApi, k8sProviderNamespace, { name: `node-${job.node_id}`, environment: {}, presets: {}, offerTemplate: {} });
              logger.info(`Deprovisioned provider node-${job.node_id} during shutdown.`);
            } catch (err) {
              logger.error(`Error while waiting for provider node-${job.node_id} during shutdown:`);
            }
          })
          .finally(() => {
            activePlans.delete(job.node_id);
            requestors.get(selectedRequestorKey).providerCount -= 1;
          })
          .then(resolve, reject);
      }, randomDelay);
    });
    activePlans.set(job.node_id, planPromise);
  }
}
