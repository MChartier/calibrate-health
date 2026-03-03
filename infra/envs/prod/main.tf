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

  runtime_enabled = var.runtime_enabled

  app_image        = "${data.aws_ecr_repository.app.repository_url}:${local.deploy_tag}"
  container_port   = 3000
  healthcheck_path = "/api/healthz"
  apex_domain      = var.domain_name
  www_domain       = "www.${var.domain_name}"

  final_snapshot_identifier = coalesce(var.db_final_snapshot_identifier, "${local.name_prefix}-final")

  common_tags = {
    App         = var.app_name
    Environment = local.environment
    ManagedBy   = "terraform"
    Stack       = local.name_prefix
  }
}

module "network" {
  source = "../../modules/network"

  name_prefix          = local.name_prefix
  vpc_cidr             = "10.30.0.0/16"
  azs                  = local.azs
  public_subnet_cidrs  = ["10.30.1.0/24", "10.30.2.0/24"]
  private_subnet_cidrs = ["10.30.101.0/24", "10.30.102.0/24"]
  extra_tags           = local.common_tags
}

resource "aws_secretsmanager_secret" "app" {
  name        = "${var.app_name}/${local.environment}/app"
  description = "Runtime configuration for ${local.name_prefix} (session secret, etc.)"
  tags        = merge(local.common_tags, { Name = "${local.name_prefix}-app-secret" })
}

module "rds" {
  count  = local.runtime_enabled ? 1 : 0
  source = "../../modules/rds"

  name_prefix               = local.name_prefix
  vpc_id                    = module.network.vpc_id
  private_subnet_ids        = module.network.private_subnet_ids
  instance_class            = var.db_instance_class
  backup_retention_days     = local.backup_days
  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = var.db_skip_final_snapshot
  final_snapshot_identifier = var.db_skip_final_snapshot ? null : local.final_snapshot_identifier
  extra_tags                = local.common_tags
}

resource "aws_acm_certificate" "prod" {
  domain_name               = local.apex_domain
  subject_alternative_names = [local.www_domain]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, {
    Name       = "${local.name_prefix}-cert"
    NamePrefix = local.name_prefix
  })
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
  count  = local.runtime_enabled ? 1 : 0
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
  desired_count     = var.service_desired_count

  environment = {
    NODE_ENV           = "production"
    PORT               = tostring(local.container_port)
    DB_HOST            = module.rds[0].address
    DB_PORT            = tostring(module.rds[0].port)
    DB_NAME            = module.rds[0].db_name
    DB_SSLMODE         = "require"
    FOOD_DATA_PROVIDER = "fatsecret"
  }

  secrets = {
    SESSION_SECRET          = "${aws_secretsmanager_secret.app.arn}:session_secret::"
    DB_USER                 = "${module.rds[0].master_user_secret_arn}:username::"
    DB_PASSWORD             = "${module.rds[0].master_user_secret_arn}:password::"
    FATSECRET_CLIENT_ID     = "${aws_secretsmanager_secret.app.arn}:fatsecret_client_id::"
    FATSECRET_CLIENT_SECRET = "${aws_secretsmanager_secret.app.arn}:fatsecret_client_secret::"
  }

  secret_arns = [
    aws_secretsmanager_secret.app.arn,
    module.rds[0].master_user_secret_arn,
  ]

  extra_tags = local.common_tags
}

module "db_secret_redeploy" {
  count  = local.runtime_enabled ? 1 : 0
  source = "../../modules/ecs_redeploy_on_secret_rotation"

  name_prefix  = local.name_prefix
  cluster_name = module.service[0].cluster_name
  service_name = module.service[0].service_name
  service_arn  = module.service[0].service_id
  secret_arn   = module.rds[0].master_user_secret_arn
  extra_tags   = local.common_tags
}

resource "aws_security_group_rule" "rds_from_service" {
  count                    = local.runtime_enabled ? 1 : 0
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = module.rds[0].security_group_id
  source_security_group_id = module.service[0].service_security_group_id
  description              = "Postgres from ${local.name_prefix} ECS service"
}

resource "aws_route53_record" "apex" {
  count   = local.runtime_enabled ? 1 : 0
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = local.apex_domain
  type    = "A"

  alias {
    name                   = module.service[0].load_balancer_dns_name
    zone_id                = module.service[0].load_balancer_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "www" {
  count   = local.runtime_enabled ? 1 : 0
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = local.www_domain
  type    = "A"

  alias {
    name                   = module.service[0].load_balancer_dns_name
    zone_id                = module.service[0].load_balancer_zone_id
    evaluate_target_health = true
  }
}

resource "aws_resourcegroups_group" "prod_environment" {
  name = "${local.name_prefix}-resources"

  resource_query {
    query = jsonencode({
      ResourceTypeFilters = ["AWS::AllSupported"]
      TagFilters = [
        {
          Key    = "App"
          Values = [var.app_name]
        },
        {
          Key    = "Environment"
          Values = [local.environment]
        },
        {
          Key    = "ManagedBy"
          Values = ["terraform"]
        }
      ]
    })
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-resources" })
}
