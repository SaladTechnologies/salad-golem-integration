# SaladCloud-Golem Network Integration Infrastructure

A project to manage the infrastructure powering the SaladCloud-Golem Network integration.

## Contents

- [SaladCloud-Golem Network Integration Infrastructure](#saladcloud-golem-network-integration-infrastructure)
  - [Contents](#contents)
  - [Getting Started](#getting-started)
    - [Installing the 1Password CLI](#installing-the-1password-cli)
    - [Installing Terraform](#installing-terraform)
  - [Deploying](#deploying)

## Getting Started

This project uses [Terraform](https://www.terraform.io/) with state stored remotely in [Terraform Cloud](https://app.terraform.io/). This project also uses the [1Password CLI](https://developer.1password.com/docs/cli) to bootstrap the environment with default secrets. In order to run the project locally, you will need to install Terraform, the 1Password CLI, the 1Password desktop app, the Kubernetes command line tool (kubectl), the Argo CD CLI (argocd), and Visual Studio Code. You will also need Terraform Cloud, 1Password, and DigitalOcean accounts with appropriate access to the Salad Technologies organizations.

### Installing the 1Password CLI

Download the latest version of the 1Password CLI from the [official website](https://app-updates.agilebits.com/product_history/CLI2). Copy the executable to a directory in your `PATH` environment variable.

Follow the [official getting started guide](https://developer.1password.com/docs/cli/get-started/) to enable the 1Password desktop app integration.

Open a terminal.

Run the following command to verify the 1Password CLI installation:

```pwsh
op --version
```

### Installing Terraform

Download the Terraform version `1.5.5` executable from the [official website](https://www.terraform.io/downloads.html). Copy the executable to a directory in your `PATH` environment variable.

> [!NOTE]
> You must use Terraform version `1.5.5`.

Open a terminal.

Run the following command to verify the Terraform installation:

```pwsh
terraform -version
```

Run the following command to login to Terraform Cloud:

```pwsh
terraform login
```

## Deploying

```pwsh
$missingToken = [string]::IsNullOrEmpty($Env:DIGITALOCEAN_TOKEN)
try {
  if ($missingToken) {
    $Env:DIGITALOCEAN_TOKEN = 'op://Employee/DigitalOcean API Token/password'
  }

  Push-Location .\infrastructure\
  try {
    terraform init
    op run -- terraform plan -out=tfplan
    op run -- terraform apply tfplan
  } finally {
    Pop-Location
  }

  Push-Location .\bootstrap\
  try {
    terraform init
    op run -- terraform plan -out=tfplan
    op run -- terraform apply tfplan
  } finally {
    Pop-Location
  }

  $job = Start-Job -Name argocd-proxy -ScriptBlock { & kubectl port-forward service/argocd-server --namespace argocd 8080:443 }
  try {
    $initialPassword = kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | `
      ForEach-Object -Process { [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($_)) }
    $password = & op read "op://Yagna Experiment/ArgoCD/password"
    & argocd login localhost:8080 --insecure --name golem-integration --password $initialPassword --username admin
    & argocd account update-password --argocd-context golem-integration --current-password $initialPassword --new-password $password
    & kubectl delete secret argocd-initial-admin-secret --namespace argocd
  } finally {
    Stop-Job -Job $job
    Remove-Job -Job $job
  }
} finally {
  if ($missingToken) {
    Remove-Item Env:DIGITALOCEAN_TOKEN -ErrorAction SilentlyContinue
  }
}
```
