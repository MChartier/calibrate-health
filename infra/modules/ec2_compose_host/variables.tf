variable "name_prefix" {
  description = "Prefix used for naming/tagging resources."
  type        = string
}

variable "app_name" {
  description = "App identifier used for tagging and on-instance paths."
  type        = string
  default     = "calibratehealth"
}

variable "environment" {
  description = "Deployment environment name (e.g., staging, prod)."
  type        = string
}

variable "aws_region" {
  description = "AWS region the instance runs in."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID to attach security groups to."
  type        = string
}

variable "subnet_id" {
  description = "Public subnet ID for the instance."
  type        = string
}

variable "ami_id" {
  description = "AMI ID for the instance."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type."
  type        = string
  default     = "t4g.micro"
}

variable "root_volume_size_gb" {
  description = "Optional root EBS volume size in GB; when null, use the AMI snapshot default."
  type        = number
  default     = null
}

variable "app_secret_arn" {
  description = "Secrets Manager ARN holding app/runtime configuration (session secret, Caddy auth, etc.)."
  type        = string
}

variable "rds_address" {
  description = "RDS hostname."
  type        = string
}

variable "rds_port" {
  description = "RDS port."
  type        = number
}

variable "rds_db_name" {
  description = "Database name."
  type        = string
}

variable "rds_master_secret_arn" {
  description = "Secrets Manager ARN for the RDS managed master user credentials."
  type        = string
}

variable "ecr_repository_url" {
  description = "ECR repository URL (no tag) for the app image."
  type        = string
}

variable "deploy_tag" {
  description = "Docker image tag to run on this host (e.g., staging, prod)."
  type        = string
}

variable "compose_yaml" {
  description = "docker-compose.yml content written to the instance."
  type        = string
}

variable "caddyfile" {
  description = "Caddyfile content written to the instance."
  type        = string
}

variable "deploy_script" {
  description = "Deploy script content written to the instance and executed via SSM."
  type        = string
}
