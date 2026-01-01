variable "aws_region" {
  description = "AWS region to provision shared resources into."
  type        = string
  default     = "us-west-2"
}

variable "domain_name" {
  description = "Primary apex domain for the app (hosted zone name)."
  type        = string
  default     = "calibratehealth.app"
}

variable "github_repo" {
  description = "GitHub repo in OWNER/REPO form allowed to assume deployment roles."
  type        = string
  default     = "MChartier/calibrate-health"
}

variable "github_default_branch" {
  description = "Default branch name allowed to assume CI/deploy roles via GitHub OIDC."
  type        = string
  default     = "master"
}

variable "ecr_repository_name" {
  description = "ECR repository name for the app image."
  type        = string
  default     = "calibratehealth"
}
