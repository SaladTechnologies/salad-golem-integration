terraform {
  required_version = "1.5.5"

  required_providers {
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
