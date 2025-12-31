output "prod_domain" {
  description = "Production apex hostname."
  value       = aws_route53_record.apex.fqdn
}

output "www_domain" {
  description = "Production www hostname."
  value       = aws_route53_record.www.fqdn
}

output "host_instance_id" {
  description = "EC2 instance ID for prod."
  value       = module.host.instance_id
}

output "host_public_ip" {
  description = "Elastic IP for prod."
  value       = module.host.eip_public_ip
}

output "rds_address" {
  description = "RDS hostname for prod."
  value       = module.rds.address
}

output "rds_master_secret_arn" {
  description = "Secrets Manager ARN holding the prod RDS master credentials."
  value       = module.rds.master_user_secret_arn
}

output "app_secret_arn" {
  description = "Secrets Manager ARN holding the prod app config JSON."
  value       = aws_secretsmanager_secret.app.arn
}

