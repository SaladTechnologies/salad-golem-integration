import { V1PersistentVolumeClaim } from '@kubernetes/client-node';
import { k8sApi } from './k8s.js';
import { logger } from './logger.js';

const k8sRequestorNamespace = 'dev-ben';

const pvcManifest: V1PersistentVolumeClaim = {
  apiVersion: 'v1',
  kind: 'PersistentVolumeClaim',
  metadata: {
    name: 'yagna-pvc',
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

const podManifest = {
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: {
    name: 'requestor-ben',
    labels: {
      'app.kubernetes.io/part-of': 'golem-network',
      'app.kubernetes.io/version': 'v0.17.6-1',
      'app.kubernetes.io/name': 'requestor-ben',
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
            name: 'yagna-pvc',
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
        env: [
          { name: 'POLYGON_MAX_FEE_PER_GAS', value: '1000' },
          { name: 'CENTRAL_NET_HOST', value: 'polygongas.org:7999' },
          { name: 'YA_NET_TYPE', value: 'central' },
          { name: 'YAGNA_API_URL', value: 'http://0.0.0.0:7465' },
          { name: 'YAGNA_AUTOCONF_APPKEY', value: 'requestor-ben' },
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
            name: 'yagna-pvc',
            mountPath: '/home/ubuntu/.local/share/yagna/',
          },
        ],
        livenessProbe: {
          httpGet: {
            path: '/version/get',
            port: 7465,
            httpHeaders: [
              { name: 'Authorization', value: 'Bearer requestor-example' },
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
        name: 'yagna-pvc',
        persistentVolumeClaim: {
          claimName: 'yagna-pvc',
        },
      },
    ],
    securityContext: {
      fsGroup: 1000,
    },
    terminationGracePeriodSeconds: 60,
  },
};

const serviceManifest = {
  apiVersion: 'v1',
  kind: 'Service',
  metadata: {
    name: 'requestor-service-ben',
  },
  spec: {
    selector: {
      'app.kubernetes.io/part-of': 'golem-network',
      'app.kubernetes.io/name': 'requestor-ben',
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
  },
};

async function main() {
  // Create PVC
  try {
    await k8sApi.createNamespacedPersistentVolumeClaim({ namespace: k8sRequestorNamespace, body: pvcManifest });
    logger.info('PersistentVolumeClaim created');
  } catch (err) {
    logger.error(err, 'Error creating PersistentVolumeClaim:');
  }

  // Create Pod
  try {
    await k8sApi.createNamespacedPod({ namespace: k8sRequestorNamespace, body: podManifest });
    logger.info('Pod created');
  } catch (err) {
    logger.error(err, 'Error creating pod:');
  }

  // Create Service
  try {
    await k8sApi.createNamespacedService({ namespace: k8sRequestorNamespace, body: serviceManifest });
    logger.info('Service created');
  } catch (err) {
    logger.error(err, 'Error creating service:');
  }
}

main();
