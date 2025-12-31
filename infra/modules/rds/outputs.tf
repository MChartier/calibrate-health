output "address" {
  description = "RDS instance hostname."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "RDS instance port."
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Database name."
  value       = var.db_name
}

output "security_group_id" {
  description = "Security group ID for the RDS instance."
  value       = aws_security_group.this.id
}

output "master_user_secret_arn" {
  description = "Secrets Manager ARN containing the managed master user credentials."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

