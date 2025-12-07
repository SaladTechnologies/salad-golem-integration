# Golem Network Orchestrator

This folder contains the Helm chart used to deploy the Golem Network orchestrator.

## Previewing

To preview the Helm chart, run the following command:

```pwsh
helm template --namespace golem --release-name example .
```

## Configuring

To configure the deployment, create the following secret files in the `secrets` directory:

- `coinmarketcapApiKey.txt` - The API key for the CoinMarketCap API.
- `matrixApiKey.txt` - The API key for the Matrix API.
- `mixpanelApiKey.txt` - The API key for the Mixpanel API.

## Deploying

To synchronize the deployment, run the `Deploy-Orchestrator.ps1` script. The script will install the release of the Helm chart.

## Updating Hull

To update the [Hull](https://github.com/vidispine/hull) dependency, modify the `version` in [Chart.yaml](./Chart.yaml). The version must match the major and minor version of the Kubernetes cluster. To update the Chart.lock file, run the following command:

```pwsh
helm dependency update
```
