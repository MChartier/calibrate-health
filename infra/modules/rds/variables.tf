variable "name_prefix" {
  description = "Prefix used for naming/tagging resources."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where the database will live."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs used for the DB subnet group."
  type        = list(string)
}

variable "db_name" {
  description = "Initial Postgres database name."
  type        = string
  default     = "calibratehealth"
}

variable "master_username" {
  description = "RDS master username (password managed by AWS Secrets Manager)."
  type        = string
  default     = "calibratehealth"
}

variable "instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage_gb" {
  description = "Allocated storage in GB."
  type        = number
  default     = 20
}

variable "backup_retention_days" {
  description = "Backup retention period in days."
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "Whether to enable deletion protection (recommended for prod)."
  type        = bool
  default     = false
}
