##### Argo CD Namespace #####

resource "kubernetes_namespace_v1" "argocd_ns" {
  lifecycle {
    ignore_changes = [
      metadata[0].annotations["argocd.argoproj.io/tracking-id"],
      timeouts,
    ]
  }

  metadata {
    labels = {
      "app.kubernetes.io/managed-by" = "terraform"
    }
    name = "argocd"
  }

  wait_for_default_service_account = true
}

##### Argo CD Deployment #####

resource "kubernetes_secret_v1" "integration_github_repo_sec" {
  lifecycle {
    ignore_changes = [
      metadata[0].annotations["argocd.argoproj.io/tracking-id"],
      timeouts,
    ]
  }

  metadata {
    labels = {
      "app.kubernetes.io/managed-by"   = "terraform"
      "argocd.argoproj.io/secret-type" = "repository"
    }
    name      = "golem-integration-github-repo"
    namespace = kubernetes_namespace_v1.argocd_ns.metadata[0].name
  }

  data = {
    githubAppID             = var.github_app_id
    githubAppInstallationID = var.github_app_installation_id
    githubAppPrivateKey     = var.github_app_private_key
    name                    = "golem-integration-apps"
    type                    = "git"
    url                     = "https://github.com/SaladTechnologies/salad-golem-integration.git"
  }
  type = "Opaque"
}

resource "kubernetes_secret_v1" "internal_github_repo_sec" {
  lifecycle {
    ignore_changes = [
      metadata[0].annotations["argocd.argoproj.io/tracking-id"],
      timeouts,
    ]
  }

  metadata {
    labels = {
      "app.kubernetes.io/managed-by"   = "terraform"
      "argocd.argoproj.io/secret-type" = "repository"
    }
    name      = "golem-internal-github-repo"
    namespace = kubernetes_namespace_v1.argocd_ns.metadata[0].name
  }

  data = {
    githubAppID             = var.github_app_id
    githubAppInstallationID = var.github_app_installation_id
    githubAppPrivateKey     = var.github_app_private_key
    name                    = "golem-internal-apps"
    type                    = "git"
    url                     = "https://github.com/SaladTechnologies/salad-golem-internal.git"
  }
  type = "Opaque"
}

# This runs kustomize to generate the list of manifests.
data "kustomization_build" "argocd" {
  path = var.kustomization_path
}

# This creates the high priority manifests first.
resource "kustomization_resource" "p0" {
  depends_on = [kubernetes_namespace_v1.argocd_ns]
  for_each   = data.kustomization_build.argocd.ids_prio[0]

  lifecycle {
    ignore_changes = [
      manifest,
      timeouts,
    ]
  }

  manifest = (
    contains(["_/Secret"], regex("(?P<group_kind>.*/.*)/.*/.*", each.value)["group_kind"])
    ? sensitive(data.kustomization_build.argocd.manifests[each.value])
    : data.kustomization_build.argocd.manifests[each.value]
  )
  wait = true
}

# This creates the medium priority manifests next.
resource "kustomization_resource" "p1" {
  depends_on = [kubernetes_namespace_v1.argocd_ns, kustomization_resource.p0]
  for_each   = data.kustomization_build.argocd.ids_prio[1]

  lifecycle {
    ignore_changes = [
      manifest,
      timeouts,
    ]
  }

  manifest = (
    contains(["_/Secret"], regex("(?P<group_kind>.*/.*)/.*/.*", each.value)["group_kind"])
    ? sensitive(data.kustomization_build.argocd.manifests[each.value])
    : data.kustomization_build.argocd.manifests[each.value]
  )
  wait = true
}

# This creates the low priority manifests last.
resource "kustomization_resource" "p2" {
  depends_on = [kubernetes_namespace_v1.argocd_ns, kustomization_resource.p1]
  for_each   = data.kustomization_build.argocd.ids_prio[2]

  lifecycle {
    ignore_changes = [
      manifest,
      timeouts,
    ]
  }

  manifest = (
    contains(["_/Secret"], regex("(?P<group_kind>.*/.*)/.*/.*", each.value)["group_kind"])
    ? sensitive(data.kustomization_build.argocd.manifests[each.value])
    : data.kustomization_build.argocd.manifests[each.value]
  )
  wait = true
}

##### Argo CD Projects #####

resource "kubernetes_manifest" "root_proj" {
  depends_on = [kustomization_resource.p2]

  manifest = {
    apiVersion = "argoproj.io/v1alpha1"
    kind       = "AppProject"
    metadata = {
      finalizers = [
        "resources-finalizer.argocd.argoproj.io"
      ]
      labels = {
        "app.kubernetes.io/managed-by" = "terraform"
      }
      name      = "root"
      namespace = kubernetes_namespace_v1.argocd_ns.metadata[0].name
    }
    spec = {
      clusterResourceBlacklist = [
        {
          group = "*"
          kind  = "*"
        }
      ]
      description = "The GitOps project containing the root application."
      destinations = [
        {
          name      = "in-cluster"
          namespace = kubernetes_namespace_v1.argocd_ns.metadata[0].name
        }
      ]
      namespaceResourceWhitelist = [
        {
          group = "argoproj.io"
          kind  = "Application"
        },
        {
          group = "argoproj.io"
          kind  = "ApplicationSet"
        },
        {
          group = "argoproj.io"
          kind  = "AppProject"
        }
      ]
      sourceRepos = [
        "https://github.com/SaladTechnologies/salad-golem-integration.git",
        "https://github.com/SaladTechnologies/salad-golem-internal.git"
      ]
    }
  }
}

resource "kubernetes_manifest" "root_app" {
  depends_on = [kustomization_resource.p2]

  manifest = {
    apiVersion = "argoproj.io/v1alpha1"
    kind       = "Application"
    metadata = {
      finalizers = [
        "resources-finalizer.argocd.argoproj.io"
      ]
      labels = {
        "app.kubernetes.io/managed-by" = "terraform"
        "app.kubernetes.io/name"       = "root"
      }
      name      = "root"
      namespace = kubernetes_namespace_v1.argocd_ns.metadata[0].name
    }
    spec = {
      destination = {
        name      = "in-cluster"
        namespace = kubernetes_namespace_v1.argocd_ns.metadata[0].name
      }
      project = kubernetes_manifest.root_proj.manifest.metadata.name
      sources = [
        {
          path           = "cluster/argocd/apps"
          repoURL        = "https://github.com/SaladTechnologies/salad-golem-integration.git"
          targetRevision = "HEAD"
        },
        {
          path           = "cluster/argocd/projects"
          repoURL        = "https://github.com/SaladTechnologies/salad-golem-integration.git"
          targetRevision = "HEAD"
        },
        {
          path           = "cluster/argocd/apps"
          repoURL        = "https://github.com/SaladTechnologies/salad-golem-internal.git"
          targetRevision = "HEAD"
        }
      ]
      syncPolicy = {
        automated = {
          prune    = true
          selfHeal = true
        }
      }
    }
  }
}
