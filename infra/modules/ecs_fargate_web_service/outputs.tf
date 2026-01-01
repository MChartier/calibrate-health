output "load_balancer_dns_name" {
  description = "DNS name of the public ALB."
  value       = aws_lb.this.dns_name
}

output "load_balancer_zone_id" {
  description = "Route 53 zone ID of the public ALB (for alias records)."
  value       = aws_lb.this.zone_id
}

output "service_security_group_id" {
  description = "Security group ID attached to ECS tasks."
  value       = aws_security_group.service.id
}

output "cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.this.name
}

output "service_id" {
  description = "ECS service identifier (provider-specific; typically the service ARN)."
  value       = aws_ecs_service.this.id
}
