# Fluent Bit

This folder contains instructions for the Helm chart used to deploy Fluent Bit for monitoring the Golem Network integration.

## Configuring

Before deploying the Helm chart, create a Kubernetes Secret to securely store the Axiom API token:

```sh
kubectl create secret generic fluent-bit-env --from-literal=AXIOM_API_TOKEN=token --namespace fluent-bit
```

Replace `token` with your real Axiom API token. This secret will be referenced by the Fluent Bit configuration for authentication.

## Deploying

To install Fluent Bit in your Kubernetes cluster using the official Helm chart:

1. **Add the Fluent Helm charts repository:**

   ```sh
   helm repo add fluent https://fluent.github.io/helm-charts
   ```

2. **Update your Helm repositories:**

   ```sh
   helm repo update
   ```

3. **Install Fluent Bit using Helm:**

   ```sh
   helm upgrade --install fluent-bit fluent/fluent-bit -f values.yaml --namespace fluent-bit
   ```

This will deploy Fluent Bit as a DaemonSet, ensuring it runs on every node in your cluster and collects logs from all pods.
