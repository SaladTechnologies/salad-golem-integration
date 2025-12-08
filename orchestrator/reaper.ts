import { k8sApi, k8sProviderNamespace } from './k8s.js';
import { deprovisionNode } from './provider.js';
import { activePlans } from './monitor.js';
import { logger } from './logger.js';

/**
 * Reaps Kubernetes unusued resources that are no longer associated with active provider nodes.
 */
export async function reapUnusedResources() {
  // Get the list of pods in the cluster
  const pods = await k8sApi.listNamespacedPod({ namespace: k8sProviderNamespace });

  // Deprovision pods that are not associated with active plans
  for (const pod of pods.items) {
    // Restrict to pods that have not already been deleted
    if (pod.metadata?.deletionTimestamp) {
      continue;
    }

    const podName = pod.metadata?.name;
    // Extract UUID from pod name assuming format node-<UUID>
    const uuidMatch = podName?.match(/^node-(.+)$/);
    const nodeId = uuidMatch ? uuidMatch[1] : podName;
    if (nodeId && !activePlans.has(nodeId)) {
      try {
        logger.info(`Reaping node: ${podName}`);
        await deprovisionNode(k8sApi, k8sProviderNamespace, { name: podName!, environment: {}, presets: {}, offerTemplate: {} });
        logger.info(`Successfully reaped node: ${podName}`);
      } catch (err) {
        logger.error(err, `Error reaping node ${podName}:`);
      }
    }
  }

  // Get the list of ConfigMaps in the namespace
  const configMaps = await k8sApi.listNamespacedConfigMap({ namespace: k8sProviderNamespace });

  // Delete ConfigMaps that are not associated with active plans
  for (const cm of configMaps.items) {
    // Restrict to ConfigMaps that have not already been deleted
    if (cm.metadata?.deletionTimestamp) {
      continue;
    }

    const cmName = cm.metadata?.name;
    // Extract the UUID from node-<UUID>-presets or node-<UUID>-template
    const uuidMatch = cmName?.match(/^node-([^-]+)-(presets|template)$/);
    const nodeId = uuidMatch ? uuidMatch[1] : cmName;
    if (nodeId && !activePlans.has(nodeId)) {
      try {
        logger.info(`Reaping ConfigMap: ${cmName}`);
        await k8sApi.deleteNamespacedConfigMap({ name: cmName!, namespace: k8sProviderNamespace });
        logger.info(`Successfully reaped ConfigMap: ${cmName}`);
      } catch (err) {
        logger.error(err, `Error reaping ConfigMap ${cmName}:`);
      }
    }
  }

  // Get the list of Secrets in the namespace
  const secrets = await k8sApi.listNamespacedSecret({ namespace: k8sProviderNamespace });

  // Delete Secrets that are not associated with active plans
  for (const secret of secrets.items) {
    // Restrict to Secrets that have not already been deleted
    if (secret.metadata?.deletionTimestamp) {
      continue;
    }

    const secretName = secret.metadata?.name;
    // Extract the UUID from node-<UUID>-env
    const uuidMatch = secretName?.match(/^node-([^-]+)-env$/);
    const uuid = uuidMatch ? uuidMatch[1] : secretName;
    if (uuid && !activePlans.has(uuid)) {
      try {
        logger.info(`Reaping Secret: ${secretName}`);
        await k8sApi.deleteNamespacedSecret({ name: secretName!, namespace: k8sProviderNamespace });
        logger.info(`Successfully reaped Secret: ${secretName}`);
      } catch (err) {
        logger.error(err, `Error reaping Secret ${secretName}:`);
      }
    }
  }
}
