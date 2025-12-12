import { ApiException, CoreV1Api, V1PersistentVolumeClaim, V1Secret } from '@kubernetes/client-node';
import { k8sApi, k8sRequestorNamespace } from './k8s.js';
import { logger } from './logger.js';

export interface Requestor {
  name: string;
  environment: Record<string, string>;
}

function generateNames(name: string) {
  return {
    environmentName: `${name}-env`,
    pvcName: `${name}-pvc`,
    podName: name,
    serviceName: `${name}-service`,
  };
}

export async function provisionRequestor(k8sApi: CoreV1Api, namespace: string, requestor: Requestor) {
  const names = generateNames(requestor.name);

  const pvcManifest: V1PersistentVolumeClaim = {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: names.pvcName,
      namespace: k8sRequestorNamespace,
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: {
        requests: {
          storage: '1Gi',
        },
      },
    },
  };

  // Create PVC
  try {
    await k8sApi.createNamespacedPersistentVolumeClaim({ namespace, body: pvcManifest });
    logger.info(`PersistentVolumeClaim ${names.pvcName} created`);
  } catch (err) {
    // Ignore if already exists
    if (err instanceof ApiException && err.code === 409) {
      logger.info(`PersistentVolumeClaim ${names.pvcName} already exists. Skipping creation.`);
    }
    else {
      logger.error(err, `Error creating PersistentVolumeClaim ${names.pvcName}:`);
    }
  }

  // Create Secret for environment variables
  const secret: V1Secret = {
    metadata: { name: names.environmentName, namespace },
    type: 'Opaque',
    stringData: requestor.environment,
  };

  try {
    await k8sApi.createNamespacedSecret({namespace, body: secret});
  } catch(err) {
    // Ignore if already exists
    if (err instanceof ApiException && err.code === 409) {
      logger.info(`Secret ${names.environmentName} already exists. Skipping creation.`);
    }
    else {
      logger.error(err, `Error creating Secret ${names.environmentName}:`);
    }
  }

  const podManifest = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: names.podName,
      labels: {
        'app.kubernetes.io/part-of': 'golem-network',
        'app.kubernetes.io/version': 'v0.17.6-1',
        'app.kubernetes.io/name': names.podName,
      },
    },
    spec: {
      initContainers: [
        {
          name: 'consent-writer',
          image: 'busybox:1.37',
          command: [
            'sh',
            '-c',
            'echo "Stats allow" > /mnt/yagna/CONSENT && chown 1000:1000 /mnt/yagna/CONSENT && chmod 0664 /mnt/yagna/CONSENT',
          ],
          resources: {
            limits: { cpu: '40m', memory: '128Mi' },
            requests: { cpu: '10m', memory: '32Mi' },
          },
          volumeMounts: [
            {
              name: names.pvcName,
              mountPath: '/mnt/yagna',
            },
          ],
        },
      ],
      containers: [
        {
          name: 'yagna',
          image: 'saladtechnologies/golem-requestor:v0.17.6-1',
          args: ['service', 'run'],
          envFrom: [
            { secretRef: { name: names.environmentName } },
          ],
          ports: [
            { containerPort: 7465, name: 'http', protocol: 'TCP' },
          ],
          resources: {
            limits: { cpu: '1', memory: '1Gi' },
            requests: { cpu: '250m', memory: '256Mi' },
          },
          volumeMounts: [
            {
              name: names.pvcName,
              mountPath: '/home/ubuntu/.local/share/yagna/',
            },
          ],
          livenessProbe: {
            httpGet: {
              path: '/version/get',
              port: 7465,
              httpHeaders: [
                { name: 'Authorization', value: `Bearer ${requestor.environment.YAGNA_AUTOCONF_APPKEY}` },
              ],
            },
            initialDelaySeconds: 10,
            periodSeconds: 10,
            timeoutSeconds: 1,
            successThreshold: 1,
            failureThreshold: 3,
          },
        },
      ],
      volumes: [
        {
          name: names.pvcName,
          persistentVolumeClaim: {
            claimName: names.pvcName,
          },
        },
      ],
      securityContext: {
        fsGroup: 1000,
      },
      terminationGracePeriodSeconds: 60,
    },
  };

  // Create Pod
  try {
    await k8sApi.createNamespacedPod({ namespace, body: podManifest });
    logger.info(`Pod ${names.podName} created`);
  } catch (err) {
    logger.error(err, `Error creating pod ${names.podName}:`);
    throw err;
  }

  const serviceManifest = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: names.serviceName,
    },
    spec: {
      selector: {
        'app.kubernetes.io/part-of': 'golem-network',
        'app.kubernetes.io/name': names.podName,
      },
      ports: [
        {
          name: 'http',
          port: 7465,
          targetPort: 7465,
          protocol: 'TCP',
        },
      ],
      type: 'ClusterIP',
      clusterIP: 'None',
    },
  };

  // Create Service
  try {
    await k8sApi.createNamespacedService({ namespace, body: serviceManifest });
    logger.info(`Service ${names.serviceName} created`);
  } catch (err) {
    // Ignore if already exists
    if (err instanceof ApiException && err.code === 409) {
      logger.info(`Service ${names.serviceName} already exists. Skipping creation.`);
    }
    else {
      logger.error(err, `Error creating service ${names.serviceName}:`);
    }
  }
}

/**
 * Deprovisions a Requestor by deleting its Pod, Service, Secret, and PVC.
 */
export async function deprovisionRequestor(k8sApi: CoreV1Api, namespace: string, name: string) {
  const names = generateNames(name);

  // Delete Pod
  try {
    await k8sApi.deleteNamespacedPod({ name: names.podName, namespace });
    logger.info(`Pod ${names.podName} deleted`);
  } catch (err) {
    logger.error(err, `Error deleting pod ${names.podName}:`);
  }

  // Delete Service
  try {
    await k8sApi.deleteNamespacedService({ name: names.serviceName, namespace });
    logger.info(`Service ${names.serviceName} deleted`);
  } catch (err) {
    logger.error(err, `Error deleting service ${names.serviceName}:`);
  }

  // Delete Secret
  try {
    await k8sApi.deleteNamespacedSecret({ name: names.environmentName, namespace });
    logger.info(`Secret ${names.environmentName} deleted`);
  } catch (err) {
    logger.error(err, `Error deleting secret ${names.environmentName}:`);
  }

  // Delete PVC
  try {
    await k8sApi.deleteNamespacedPersistentVolumeClaim({ name: names.pvcName, namespace });
    logger.info(`PersistentVolumeClaim ${names.pvcName} deleted`);
  } catch (err) {
    logger.error(err, `Error deleting PersistentVolumeClaim ${names.pvcName}:`);
  }
}
