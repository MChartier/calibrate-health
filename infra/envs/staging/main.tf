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

data "aws_ami" "al2023_arm64" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-kernel-6.1-arm64"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

locals {
  environment = "staging"
  name_prefix = "${var.app_name}-${local.environment}"
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)

  deploy_dir     = abspath("${path.module}/../../../deploy")
  compose_yaml   = file("${local.deploy_dir}/docker-compose.yml")
  caddyfile      = file("${local.deploy_dir}/Caddyfile.staging")
  deploy_script  = file("${path.module}/../../scripts/deploy.sh")
  backup_days    = 3
  deploy_tag     = local.environment
  staging_domain = "staging.${var.domain_name}"
}

module "network" {
  source = "../../modules/network"

  name_prefix          = local.name_prefix
  vpc_cidr             = "10.20.0.0/16"
  azs                  = local.azs
  public_subnet_cidrs  = ["10.20.1.0/24", "10.20.2.0/24"]
  private_subnet_cidrs = ["10.20.101.0/24", "10.20.102.0/24"]
}

resource "aws_secretsmanager_secret" "app" {
  name        = "${var.app_name}/${local.environment}/app"
  description = "Runtime configuration for ${local.name_prefix} (session secret, Caddy auth, etc.)"
}

module "rds" {
  source = "../../modules/rds"

  name_prefix           = local.name_prefix
  vpc_id                = module.network.vpc_id
  private_subnet_ids    = module.network.private_subnet_ids
  instance_class        = var.db_instance_class
  backup_retention_days = local.backup_days
  deletion_protection   = false
}

module "host" {
  source = "../../modules/ec2_compose_host"

  name_prefix           = local.name_prefix
  app_name              = var.app_name
  environment           = local.environment
  aws_region            = var.aws_region
  vpc_id                = module.network.vpc_id
  subnet_id             = module.network.public_subnet_ids[0]
  ami_id                = data.aws_ami.al2023_arm64.id
  instance_type         = var.instance_type
  app_secret_arn        = aws_secretsmanager_secret.app.arn
  rds_address           = module.rds.address
  rds_port              = module.rds.port
  rds_db_name           = module.rds.db_name
  rds_master_secret_arn = module.rds.master_user_secret_arn
  ecr_repository_url    = data.aws_ecr_repository.app.repository_url
  deploy_tag            = local.deploy_tag

  compose_yaml  = local.compose_yaml
  caddyfile     = local.caddyfile
  deploy_script = local.deploy_script
}

resource "aws_security_group_rule" "rds_from_host" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = module.rds.security_group_id
  source_security_group_id = module.host.security_group_id
  description              = "Postgres from ${local.name_prefix} host"
}

resource "aws_route53_record" "staging" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = local.staging_domain
  type    = "A"
  ttl     = 300
  records = [module.host.eip_public_ip]
}

