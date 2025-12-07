module "doks-cluster" {
  source = "./doks-cluster"

  cluster_name        = "golem-integration"
  cluster_subnet      = "10.11.0.0/16"
  max_nodes           = 6
  min_nodes           = 2
  project_description = "Resources powering the Golem integration"
  project_name        = "golem-integration"
  service_subnet      = "10.10.32.0/19"
  vpc_description     = "Network powering the Golem integration"
  vpc_name            = "golem-integration"
  vpc_subnet          = "10.10.0.0/19"
}
