terraform {
  backend "remote" {
    hostname     = "app.terraform.io"
    organization = "Salad"

    workspaces {
      name = "golem-integration-plan-2"
    }
  }
}
