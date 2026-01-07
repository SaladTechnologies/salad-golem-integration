import { V1Service, V1StatefulSet } from "@kubernetes/client-node";
import { k8sApi, k8sAppsApi, k8sRequestorNamespace } from "./k8s.js";
import { logger } from "./logger.js";

function generateNames(name: string) {
  return {
    statefulSetName: name,
    serviceName: `${name}-service`,
  };
}

export async function provisionRelay(name: string) {
  const names = generateNames(name);
  const relayTag = 'latest';

  const statefulSetManifest: V1StatefulSet = {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: {
      name: names.statefulSetName,
      labels: {
        'app.kubernetes.io/part-of': 'golem-network',
        'app.kubernetes.io/version': relayTag,
      },
    },
    spec: {
      serviceName: names.statefulSetName,
      replicas: 1,
      minReadySeconds: 60,
      revisionHistoryLimit: 1,
      updateStrategy: {
        type: 'RollingUpdate',
        rollingUpdate: {
          maxUnavailable: 1,
          partition: 0,
        },
      },
      selector: {
        matchLabels: {
          'app.kubernetes.io/part-of': 'golem-network',
          'app.kubernetes.io/version': relayTag,
          'app.kubernetes.io/name': names.statefulSetName,
        },
      },
      template: {
        metadata: {
          labels: {
            'app.kubernetes.io/part-of': 'golem-network',
            'app.kubernetes.io/version': relayTag,
            'app.kubernetes.io/name': names.statefulSetName,
          },
        },
        spec: {
          containers: [
            {
              name: names.statefulSetName,
              image: `saladtechnologies/golem-relay:${relayTag}`,
              imagePullPolicy: 'IfNotPresent',
              ports: [
                {
                  containerPort: 7477,
                  protocol: 'UDP',
                  name: 'relay',
                },
              ],
              resources: {
                limits: {
                  cpu: '1',
                  memory: '1Gi',
                },
                requests: {
                  cpu: '250m',
                  memory: '256Mi',
                },
              },
            },
          ],
          terminationGracePeriodSeconds: 10,
        },
      },
    },
  };

  // Create StatefulSet
  try {
    await k8sAppsApi.createNamespacedStatefulSet({ namespace: k8sRequestorNamespace, body: statefulSetManifest });
    logger.info(`StatefulSet ${names.statefulSetName} created`);
  } catch (err) {
    logger.error(err, `Error creating StatefulSet ${names.statefulSetName}:`);
  }

  const serviceManifest: V1Service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: names.serviceName,
      labels: {
        'app.kubernetes.io/part-of': 'golem-network',
        'app.kubernetes.io/version': relayTag,
      },
    },
    spec: {
      type: 'ClusterIP',
      clusterIP: 'None',
      selector: {
        'app.kubernetes.io/part-of': 'golem-network',
        'app.kubernetes.io/version': relayTag,
        'app.kubernetes.io/name': names.statefulSetName,
      },
      ports: [
        {
          name: 'relay',
          port: 7477,
          targetPort: 7477,
          protocol: 'UDP',
        },
      ],
    },
  };

  // Create Service
  try {
    await k8sApi.createNamespacedService({ namespace: k8sRequestorNamespace, body: serviceManifest });
    logger.info(`Service ${names.serviceName} created`);
  } catch (err) {
    logger.error(err, `Error creating service ${names.serviceName}:`);
  }
}

export async function deprovisionRelay(name: string) {
  const names = generateNames(name);

  // Delete service
  try {
    await k8sApi.deleteNamespacedService({ name: names.serviceName, namespace: k8sRequestorNamespace });
    logger.info(`Service ${names.serviceName} deleted`);
  } catch (err) {
    logger.error(err, `Error deleting service ${names.serviceName}:`);
  }

  // Delete StatefulSet
  try {
    await k8sAppsApi.deleteNamespacedStatefulSet({ name: names.statefulSetName, namespace: k8sRequestorNamespace });
    logger.info(`StatefulSet ${names.statefulSetName} deleted`);
  } catch (err) {
    logger.error(err, `Error deleting StatefulSet ${names.statefulSetName}:`);
  }
}
