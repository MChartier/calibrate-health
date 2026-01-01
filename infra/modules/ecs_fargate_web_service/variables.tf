variable "name_prefix" {
  description = "Prefix used for naming/tagging resources (should be unique per environment)."
  type        = string
}

variable "aws_region" {
  description = "AWS region hosting the ECS service/ALB (used for CloudWatch Logs configuration)."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where the ALB + ECS tasks run."
  type        = string
}

variable "alb_subnet_ids" {
  description = "Subnet IDs for the public (internet-facing) ALB."
  type        = list(string)
}

variable "service_subnet_ids" {
  description = "Subnet IDs for ECS tasks. These must have egress to ECR/CloudWatch Logs/Secrets Manager."
  type        = list(string)
}

variable "assign_public_ip" {
  description = "Whether ECS tasks should receive public IPs (simple option when you do not have NAT for private subnets)."
  type        = bool
  default     = true
}

variable "allowed_inbound_cidrs" {
  description = "CIDR blocks allowed to reach the ALB (80/443). Use this to restrict staging access."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "certificate_arn" {
  description = "ACM certificate ARN for the ALB HTTPS listener."
  type        = string
}

variable "container_image" {
  description = "Container image URI (typically an ECR repo URL with a tag)."
  type        = string
}

variable "container_port" {
  description = "Container port exposed to the target group."
  type        = number
  default     = 3000
}

variable "health_check_path" {
  description = "HTTP path used by the ALB target group health check."
  type        = string
  default     = "/api/healthz"
}

variable "desired_count" {
  description = "Number of running tasks."
  type        = number
  default     = 1
}

variable "cpu" {
  description = "Fargate task CPU units."
  type        = string
  default     = "256"
}

variable "memory" {
  description = "Fargate task memory (MiB)."
  type        = string
  default     = "512"
}

variable "environment" {
  description = "Plaintext environment variables (non-secret) for the container."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Secret environment variables for the container (env var name -> valueFrom ARN, optionally with JSON key selectors)."
  type        = map(string)
  default     = {}
}

variable "secret_arns" {
  description = "Base Secrets Manager ARNs the task execution role is allowed to read (do NOT include JSON key suffixes)."
  type        = list(string)
  default     = []
}

variable "log_retention_in_days" {
  description = "CloudWatch Logs retention period for the ECS service."
  type        = number
  default     = 14
}

