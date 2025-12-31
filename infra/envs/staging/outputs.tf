output "staging_domain" {
  description = "Staging hostname."
  value       = aws_route53_record.staging.fqdn
}

output "host_instance_id" {
  description = "EC2 instance ID for staging."
  value       = module.host.instance_id
}

output "host_public_ip" {
  description = "Elastic IP for staging."
  value       = module.host.eip_public_ip
}

output "rds_address" {
  description = "RDS hostname for staging."
  value       = module.rds.address
}

output "rds_master_secret_arn" {
  description = "Secrets Manager ARN holding the staging RDS master credentials."
  value       = module.rds.master_user_secret_arn
}

output "app_secret_arn" {
  description = "Secrets Manager ARN holding the staging app config JSON."
  value       = aws_secretsmanager_secret.app.arn
}

