##### Project #####

resource "digitalocean_project" "default" {
  name        = var.project_name
  description = var.project_description == "" ? null : var.project_description
  purpose     = "Service or API"
  environment = "Production"
  resources   = [digitalocean_kubernetes_cluster.default.urn]
}

##### VPC #####

resource "digitalocean_vpc" "default" {
  name        = var.vpc_name
  region      = var.region
  description = var.vpc_description == "" ? null : var.vpc_description
  ip_range    = var.vpc_subnet
}

##### Kubernetes Cluster #####

data "digitalocean_kubernetes_versions" "default" {
  version_prefix = "${var.cluster_version}."
}

resource "digitalocean_kubernetes_cluster" "default" {
  name                 = var.cluster_name
  region               = var.region
  version              = data.digitalocean_kubernetes_versions.default.latest_version
  cluster_subnet       = var.cluster_subnet
  service_subnet       = var.service_subnet
  vpc_uuid             = digitalocean_vpc.default.id
  auto_upgrade         = true
  surge_upgrade        = true
  ha                   = true
  registry_integration = false

  node_pool {
    name       = "nodes"
    size       = var.node_size
    auto_scale = true
    min_nodes  = var.min_nodes
    max_nodes  = var.max_nodes
  }

  # This converts to noon PST (until March).
  maintenance_policy {
    day        = "sunday"
    start_time = "20:00"
  }

  # This ensures we do not orphan resources when destroying the cluster and incur unwanted costs.
  destroy_all_associated_resources = true
}
