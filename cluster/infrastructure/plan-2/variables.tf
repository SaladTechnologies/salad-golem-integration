variable "github_app_id" {
  type        = string
  description = "The GitHub App ID used to authenticate to GitHub."
}

variable "github_app_installation_id" {
  type        = string
  description = "The GitHub App installation ID used to authenticate to GitHub."
}

variable "github_app_private_key" {
  type        = string
  description = "The GitHub App private key used to authenticate to GitHub."
  sensitive   = true
}
