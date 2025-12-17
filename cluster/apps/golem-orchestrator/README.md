# Golem Network Orchestrator

This directory contains the Helm chart used to deploy the Golem Network orchestrator. The deployment is automated via Argo CD.

## Updating the Image Tag

To update the image tag, modify the `hull.config.specific.tag` value in the `values.yaml` file.

## Updating Hull

To update the [Hull](https://github.com/vidispine/hull) dependency, modify the `version` in [Chart.yaml](./Chart.yaml). The version must match the major and minor version of the Kubernetes cluster. To update the Chart.lock file, run the following command:

```pwsh
helm dependency update
```
