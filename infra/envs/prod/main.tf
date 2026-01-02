data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_route53_zone" "primary" {
  name         = "${var.domain_name}."
  private_zone = false
}

data "aws_ecr_repository" "app" {
  name = var.app_name
}

locals {
  environment = "prod"
  name_prefix = "${var.app_name}-${local.environment}"
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)

  backup_days = 14
  deploy_tag  = local.environment

  app_image        = "${data.aws_ecr_repository.app.repository_url}:${local.deploy_tag}"
  container_port   = 3000
  healthcheck_path = "/api/healthz"
  apex_domain      = var.domain_name
  www_domain       = "www.${var.domain_name}"
}

module "network" {
  source = "../../modules/network"

  name_prefix          = local.name_prefix
  vpc_cidr             = "10.30.0.0/16"
  azs                  = local.azs
  public_subnet_cidrs  = ["10.30.1.0/24", "10.30.2.0/24"]
  private_subnet_cidrs = ["10.30.101.0/24", "10.30.102.0/24"]
}

resource "aws_secretsmanager_secret" "app" {
  name        = "${var.app_name}/${local.environment}/app"
  description = "Runtime configuration for ${local.name_prefix} (session secret, etc.)"
}

module "rds" {
  source = "../../modules/rds"

  name_prefix           = local.name_prefix
  vpc_id                = module.network.vpc_id
  private_subnet_ids    = module.network.private_subnet_ids
  instance_class        = var.db_instance_class
  backup_retention_days = local.backup_days
  deletion_protection   = true
}

resource "aws_acm_certificate" "prod" {
  domain_name               = local.apex_domain
  subject_alternative_names = [local.www_domain]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { NamePrefix = local.name_prefix }
}

resource "aws_route53_record" "prod_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.prod.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = data.aws_route53_zone.primary.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "prod" {
  certificate_arn         = aws_acm_certificate.prod.arn
  validation_record_fqdns = [for record in aws_route53_record.prod_cert_validation : record.fqdn]
}

module "service" {
  source = "../../modules/ecs_fargate_web_service"

  name_prefix = local.name_prefix
  aws_region  = var.aws_region
  vpc_id      = module.network.vpc_id

  alb_subnet_ids     = module.network.public_subnet_ids
  service_subnet_ids = module.network.public_subnet_ids
  assign_public_ip   = true

  allowed_inbound_cidrs = var.alb_allowed_cidrs
  certificate_arn       = aws_acm_certificate_validation.prod.certificate_arn

  container_image   = local.app_image
  container_port    = local.container_port
  health_check_path = local.healthcheck_path
  desired_count     = 1

  environment = {
    NODE_ENV   = "production"
    PORT       = tostring(local.container_port)
    DB_HOST    = module.rds.address
    DB_PORT    = tostring(module.rds.port)
    DB_NAME    = module.rds.db_name
    DB_SSLMODE = "require"
  }

  secrets = {
    SESSION_SECRET = "${aws_secretsmanager_secret.app.arn}:session_secret::"
    DB_USER        = "${module.rds.master_user_secret_arn}:username::"
    DB_PASSWORD    = "${module.rds.master_user_secret_arn}:password::"
  }

  secret_arns = [
    aws_secretsmanager_secret.app.arn,
    module.rds.master_user_secret_arn,
  ]
}

resource "aws_security_group_rule" "rds_from_service" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = module.rds.security_group_id
  source_security_group_id = module.service.service_security_group_id
  description              = "Postgres from ${local.name_prefix} ECS service"
}

resource "aws_route53_record" "apex" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = local.apex_domain
  type    = "A"

  alias {
    name                   = module.service.load_balancer_dns_name
    zone_id                = module.service.load_balancer_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "www" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = local.www_domain
  type    = "A"

  alias {
    name                   = module.service.load_balancer_dns_name
    zone_id                = module.service.load_balancer_zone_id
    evaluate_target_health = true
  }
}
