import { CoreV1Api, KubeConfig } from '@kubernetes/client-node';
import config from 'config';

const kc = new KubeConfig();
kc.loadFromFile(config.get('kubeConfigPath')); // specify your kubeconfig path

export const k8sApi = kc.makeApiClient(CoreV1Api);
export const k8sProviderNamespace: string = config.get('k8sProviderNamespace'); // specify your namespace
