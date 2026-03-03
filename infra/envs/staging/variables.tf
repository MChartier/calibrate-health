variable "aws_region" {
  description = "AWS region for this environment."
  type        = string
  default     = "us-west-2"
}

variable "app_name" {
  description = "Application identifier used for tagging."
  type        = string
  default     = "calibratehealth"
}

variable "domain_name" {
  description = "Apex domain for Route 53 zone lookup."
  type        = string
  default     = "calibratehealth.app"
}

variable "runtime_enabled" {
  description = "When false, destroy runtime resources (ECS service/ALB/RDS) to minimize monthly cost."
  type        = bool
  default     = true
}

variable "service_desired_count" {
  description = "Number of running ECS tasks when runtime_enabled is true."
  type        = number
  default     = 1

  validation {
    condition     = var.service_desired_count >= 0
    error_message = "service_desired_count must be zero or a positive integer."
  }
}

variable "alb_allowed_cidrs" {
  description = "CIDR blocks allowed to reach the staging ALB (80/443)."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_deletion_protection" {
  description = "Whether to enable deletion protection on the RDS instance."
  type        = bool
  default     = false
}

variable "db_skip_final_snapshot" {
  description = "When false, Terraform creates a final RDS snapshot before deleting the instance."
  type        = bool
  default     = false
}

variable "db_final_snapshot_identifier" {
  description = "Optional final RDS snapshot identifier override used when db_skip_final_snapshot is false."
  type        = string
  default     = null
}
