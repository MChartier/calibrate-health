output "staging_domain" {
  description = "Staging hostname."
  value       = aws_route53_record.staging.fqdn
}

output "alb_dns_name" {
  description = "Public ALB DNS name for staging."
  value       = module.service.load_balancer_dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name for staging."
  value       = module.service.cluster_name
}

output "ecs_service_name" {
  description = "ECS service name for staging."
  value       = module.service.service_name
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
