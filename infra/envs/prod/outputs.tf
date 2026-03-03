output "prod_domain" {
  description = "Production apex hostname (null when runtime is suspended)."
  value       = try(aws_route53_record.apex[0].fqdn, null)
}

output "www_domain" {
  description = "Production www hostname (null when runtime is suspended)."
  value       = try(aws_route53_record.www[0].fqdn, null)
}

output "alb_dns_name" {
  description = "Public ALB DNS name for prod (null when runtime is suspended)."
  value       = try(module.service[0].load_balancer_dns_name, null)
}

output "ecs_cluster_name" {
  description = "ECS cluster name for prod (null when runtime is suspended)."
  value       = try(module.service[0].cluster_name, null)
}

output "ecs_service_name" {
  description = "ECS service name for prod (null when runtime is suspended)."
  value       = try(module.service[0].service_name, null)
}

output "rds_address" {
  description = "RDS hostname for prod (null when runtime is suspended)."
  value       = try(module.rds[0].address, null)
}

output "rds_master_secret_arn" {
  description = "Secrets Manager ARN holding the prod RDS master credentials (null when runtime is suspended)."
  value       = try(module.rds[0].master_user_secret_arn, null)
}

output "app_secret_arn" {
  description = "Secrets Manager ARN holding the prod app config JSON."
  value       = aws_secretsmanager_secret.app.arn
}

output "resource_group_name" {
  description = "AWS Resource Groups name for this environment's tagged resources."
  value       = aws_resourcegroups_group.prod_environment.name
}

output "resource_group_arn" {
  description = "AWS Resource Groups ARN for this environment's tagged resources."
  value       = aws_resourcegroups_group.prod_environment.arn
}
