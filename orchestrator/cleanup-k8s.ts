// Get all pods in the default namespace and deprovision them
import { k8sApi, k8sProviderNamespace } from './k8s.js';
import { deprovisionNode } from './provider.js';
import { logger } from './logger.js';

async function cleanupK8sPods() {
  try {
    const res = await k8sApi.listNamespacedPod({ namespace: k8sProviderNamespace });
    const pods = res.items;

    console.log(`Found ${pods.length} pods to clean up.`);

    for (const pod of pods) {
      const podName = pod.metadata?.name;
      if (podName) {
        logger.info(`Deprovisioning pod: ${podName}`);
        await deprovisionNode(k8sApi, k8sProviderNamespace, { name: podName, environment: {}, presets: {}, offerTemplate: {} });
        logger.info(`Deprovisioned pod: ${podName}`);
      }
    }
  } catch (err) {
    logger.error('Error during cleanup of Kubernetes pods:');
    console.error(err);
  }
}

await cleanupK8sPods();
