// Get all pods in the default namespace and deprovision them
import { k8sApi, k8sAppsApi, k8sProviderNamespace, k8sRequestorNamespace } from './k8s.js';
import { deprovisionNode } from './provider.js';
import { logger } from './logger.js';
import { deprovisionRequestor } from './requestor.js';
import { deprovisionRelay } from './relay.js';

async function cleanupProviderPods() {
  try {
    const res = await k8sApi.listNamespacedPod({ namespace: k8sProviderNamespace });
    const pods = res.items;

    console.log(`Found ${pods.length} provider pods to clean up.`);

    for (const pod of pods) {
      const podName = pod.metadata?.name;
      if (podName && podName.startsWith('node-')) {
        logger.info(`Deprovisioning provider pod: ${podName}`);
        await deprovisionNode(k8sApi, k8sProviderNamespace, { name: podName, environment: {}, presets: {}, offerTemplate: {} });
        logger.info(`Deprovisioned provider pod: ${podName}`);
      }
    }
  } catch (err) {
    logger.error('Error during cleanup of provider Kubernetes pods:');
    console.error(err);
  }
}

async function cleanupRequestorPods() {
  try {
    const res = await k8sApi.listNamespacedPod({ namespace: k8sRequestorNamespace });
    const pods = res.items;

    console.log(`Found ${pods.length} requestor pods to clean up.`);

    for (const pod of pods) {
      const podName = pod.metadata?.name;
      // Check if pod name starts with "requestor-"
      if (podName && podName.startsWith('requestor-')) {
        logger.info(`Deprovisioning requestor pod: ${podName}`);
        await deprovisionRequestor(k8sApi, k8sRequestorNamespace, podName);
        logger.info(`Deprovisioned requestor pod: ${podName}`);
      }
    }
  } catch (err) {
    logger.error('Error during cleanup of requestor Kubernetes pods:');
    console.error(err);
  }
}

async function cleanupRelayPods() {
  try {
    // List stateful sets in the requestor namespace
    const res = await k8sAppsApi.listNamespacedStatefulSet({ namespace: k8sRequestorNamespace });
    const statefulSets = res.items;

    console.log(`Found ${statefulSets.length} relay stateful sets to clean up.`);

    for (const statefulSet of statefulSets) {
      const statefulSetName = statefulSet.metadata?.name;
      // Check if pod name starts with "relay-"
      if (statefulSetName && statefulSetName.startsWith('relay-')) {
        logger.info(`Deprovisioning relay stateful set: ${statefulSetName}`);
        await deprovisionRelay(statefulSetName);
        logger.info(`Deprovisioned relay stateful set: ${statefulSetName}`);
      }
    }
  } catch (err) {
    logger.error('Error during cleanup of relay Kubernetes stateful sets:');
    console.error(err);
  }
}

await cleanupProviderPods();
await cleanupRequestorPods();
await cleanupRelayPods();

logger.info('Kubernetes cleanup completed.');

process.exit(0);
