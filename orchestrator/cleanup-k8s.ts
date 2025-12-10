// Get all pods in the default namespace and deprovision them
import { k8sApi, k8sProviderNamespace, k8sRequestorNamespace } from './k8s.js';
import { deprovisionNode } from './provider.js';
import { logger } from './logger.js';
import { deprovisionRequestor } from './requestor.js';

async function cleanupProviderPods() {
  try {
    const res = await k8sApi.listNamespacedPod({ namespace: k8sProviderNamespace });
    const pods = res.items;

    console.log(`Found ${pods.length} provider pods to clean up.`);

    for (const pod of pods) {
      const podName = pod.metadata?.name;
      if (podName) {
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
      if (podName) {
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

await cleanupProviderPods();
await cleanupRequestorPods();
