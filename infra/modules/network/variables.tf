variable "name_prefix" {
  description = "Prefix used for naming/tagging resources."
  type        = string
}

variable "extra_tags" {
  description = "Additional tags applied to all module resources."
  type        = map(string)
  default     = {}
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
}

variable "azs" {
  description = "Availability zones to spread subnets across."
  type        = list(string)
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (must match az count)."
  type        = list(string)
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (must match az count)."
  type        = list(string)
}
