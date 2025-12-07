module "argocd" {
  source = "./argocd"

  kustomization_path = "${path.root}/../../charts/argocd"
}
