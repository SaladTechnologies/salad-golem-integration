module "argocd" {
  source = "./argocd"

  kustomization_path = "${path.root}/../../apps/argocd"
}
