terraform {
  required_version = "1.5.5"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2"
    }

    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3"
    }

    kustomization = {
      source  = "kbst/kustomization"
      version = "~> 0.9"
    }
  }
}

provider "digitalocean" {
}

provider "kubernetes" {
  host                   = data.digitalocean_kubernetes_cluster.default.endpoint
  cluster_ca_certificate = base64decode(data.digitalocean_kubernetes_cluster.default.kube_config[0].cluster_ca_certificate)
  token                  = data.digitalocean_kubernetes_cluster.default.kube_config[0].token
}

provider "kustomization" {
  kubeconfig_raw = data.digitalocean_kubernetes_cluster.default.kube_config[0].raw_config
}

data "digitalocean_kubernetes_cluster" "default" {
  name = "golem-integration"
}
