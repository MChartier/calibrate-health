output "staging_domain" {
  description = "Staging hostname (null when runtime is suspended)."
  value       = try(aws_route53_record.staging[0].fqdn, null)
}

output "alb_dns_name" {
  description = "Public ALB DNS name for staging (null when runtime is suspended)."
  value       = try(module.service[0].load_balancer_dns_name, null)
}

output "ecs_cluster_name" {
  description = "ECS cluster name for staging (null when runtime is suspended)."
  value       = try(module.service[0].cluster_name, null)
}

output "ecs_service_name" {
  description = "ECS service name for staging (null when runtime is suspended)."
  value       = try(module.service[0].service_name, null)
}

output "rds_address" {
  description = "RDS hostname for staging (null when runtime is suspended)."
  value       = try(module.rds[0].address, null)
}

output "rds_master_secret_arn" {
  description = "Secrets Manager ARN holding the staging RDS master credentials (null when runtime is suspended)."
  value       = try(module.rds[0].master_user_secret_arn, null)
}

output "app_secret_arn" {
  description = "Secrets Manager ARN holding the staging app config JSON."
  value       = aws_secretsmanager_secret.app.arn
}

output "resource_group_name" {
  description = "AWS Resource Groups name for this environment's tagged resources."
  value       = aws_resourcegroups_group.staging_environment.name
}

output "resource_group_arn" {
  description = "AWS Resource Groups ARN for this environment's tagged resources."
  value       = aws_resourcegroups_group.staging_environment.arn
}
