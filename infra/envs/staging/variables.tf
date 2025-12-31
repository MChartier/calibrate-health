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
