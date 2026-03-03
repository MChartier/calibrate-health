variable "name_prefix" {
  description = "Prefix used for naming resources."
  type        = string
}

variable "extra_tags" {
  description = "Additional tags applied to all taggable module resources."
  type        = map(string)
  default     = {}
}

variable "cluster_name" {
  description = "ECS cluster name that should be redeployed after rotation."
  type        = string
}

variable "service_name" {
  description = "ECS service name that should be redeployed after rotation."
  type        = string
}

variable "service_arn" {
  description = "ECS service ARN used to scope IAM permissions."
  type        = string
}

variable "secret_arn" {
  description = "Secrets Manager ARN for the rotated DB credentials."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention (days) for the rotation handler."
  type        = number
  default     = 14
}
