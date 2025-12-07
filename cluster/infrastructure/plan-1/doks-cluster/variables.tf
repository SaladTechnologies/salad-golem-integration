variable "cluster_name" {
  type        = string
  description = "The name of the Kubernetes cluster."
}

variable "cluster_subnet" {
  type        = string
  description = "The IP address range, in CIDR notation, used by the Kubernetes pods (e.g. '10.102.0.0/16'). This must not overlap with any other subnets, including other VPCs and Kubernetes clusters."
}

variable "cluster_version" {
  type        = string
  default     = "1.34"
  description = "The Kubernetes major and minor version prefix used by the Kubernetes cluster (e.g. '1.34'). The cluster will automatically use the latest available patch version."
}

variable "max_nodes" {
  type        = number
  description = "The maximum number of nodes in the default node pool."
}

variable "min_nodes" {
  type        = number
  description = "The minimum number of nodes in the default node pool."
}

variable "node_size" {
  type        = string
  default     = "g-2vcpu-8gb"
  description = "The slug identifier of the Droplet size used by the default node pool (e.g. 'g-2vcpu-8gb')."
}

variable "project_description" {
  type        = string
  default     = ""
  description = "The description of the project."
}

variable "project_name" {
  type        = string
  description = "The name of the project."
}

variable "region" {
  type        = string
  default     = "nyc3"
  description = "The slug identifier of the data center region (e.g. 'nyc3')."
}

variable "service_subnet" {
  type        = string
  description = "The IP address range, in CIDR notation, used by the Kubernetes services (e.g. '10.101.0.0/19'). This must not overlap with any other subnets, including other VPCs and Kubernetes clusters."
}

variable "vpc_description" {
  type        = string
  default     = ""
  description = "The description of the VPC."
}

variable "vpc_name" {
  type        = string
  description = "The name of the VPC."
}

variable "vpc_subnet" {
  type        = string
  description = "The IP address range, in CIDR notation, used by Droplets (e.g. Kubernetes nodes) in the VPC (e.g. '10.100.0.0/24'). This must not overlap with any other subnets, including other VPCs and Kubernetes clusters."
}
