import { AppsV1Api, CoreV1Api, Exec, KubeConfig } from '@kubernetes/client-node';
import config from 'config';
import { Writable } from 'stream';

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

export async function execAndParseJson(
  namespace: string,
  podName: string,
  containerName: string,
  command: string[]): Promise<any> {
  let output = '';
  const writable = new Writable({
    write(chunk, encoding, callback) {
      output += chunk.toString();
      callback();
    }
  });

  const exec = new Exec(kc);
  // Verify connection by executing a simple command
  await exec.exec(
    namespace,
    podName,
    containerName,
    command,
    writable,
    process.stderr,
    null,
    false
  );

  // Wait a moment to ensure all output is captured
  await new Promise(resolve => setTimeout(resolve, 2000));

  return JSON.parse(output);
}
