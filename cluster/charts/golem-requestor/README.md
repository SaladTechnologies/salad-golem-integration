# SaladCloud Organization as a Golem Network Requestor

This folder contains the Helm chart used to deploy Yagna as a Golem Network requestor to act on behalf of a SaladCloud organization. The Helm chart is deployed multiple times, one release for each SaladCloud organization.

## Previewing

To preview the Helm chart, run the following command:

```pwsh
helm template --namespace golem-requestors --release-name example .
```

## Configuring

To configure the deployments, for each SaladCloud organization:

1. Create a subdirectory in `deployments`.
2. In the subdirectory, create a `privateKey.txt` file containing the private key of the Ethereum wallet (as a hexadecimal string) used to fund the requestor.

## Deploying

To synchronize the deployments, run the `Deploy-Requestor.ps1` script. The script will install a separate release of the Helm chart for each SaladCloud organization found in the `deployments` directory. It will also uninstall any existing releases that do not correspond to a subdirectory in the `deployments` directory.

## Updating Hull

To update the [Hull](https://github.com/vidispine/hull) dependency, modify the `version` in [Chart.yaml](./Chart.yaml). The version must match the major and minor version of the Kubernetes cluster. To update the Chart.lock file, run the following command:

```pwsh
helm dependency update
```
