module "argocd" {
  source = "./argocd"

  github_app_id              = var.github_app_id
  github_app_installation_id = var.github_app_installation_id
  github_app_private_key     = var.github_app_private_key
  kustomization_path         = "${path.root}/../../apps/argocd"
}
