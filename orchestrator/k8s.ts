import { AppsV1Api, CoreV1Api, KubeConfig } from '@kubernetes/client-node';
import config from 'config';

const kc = new KubeConfig();

const kubeConfigPath = config.get<string>('kubeConfigPath');
if (kubeConfigPath != null && kubeConfigPath !== '') {
  kc.loadFromFile(kubeConfigPath); // specify your kubeconfig path
} else {
  kc.loadFromDefault();
}

export const k8sApi = kc.makeApiClient(CoreV1Api);
export const k8sAppsApi = kc.makeApiClient(AppsV1Api);
export const k8sProviderNamespace = config.get<string>('k8sProviderNamespace');
export const k8sRequestorNamespace = config.get<string>('k8sRequestorNamespace');
