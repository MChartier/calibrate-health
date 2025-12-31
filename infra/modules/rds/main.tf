locals {
  common_tags = {
    NamePrefix = var.name_prefix
  }
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db-subnets"
  subnet_ids = var.private_subnet_ids

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-db-subnets" })
}

resource "aws_security_group" "this" {
  name        = "${var.name_prefix}-rds-sg"
  description = "Postgres access for ${var.name_prefix}"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-rds-sg" })
}

resource "aws_db_instance" "this" {
  identifier = "${var.name_prefix}-postgres"

  engine         = "postgres"
  instance_class = var.instance_class

  allocated_storage = var.allocated_storage_gb
  storage_type      = "gp3"
  storage_encrypted = true

  db_name                         = var.db_name
  username                        = var.master_username
  manage_master_user_password     = true
  port                            = 5432
  db_subnet_group_name            = aws_db_subnet_group.this.name
  vpc_security_group_ids          = [aws_security_group.this.id]
  publicly_accessible             = false
  auto_minor_version_upgrade      = true
  backup_retention_period         = var.backup_retention_days
  deletion_protection             = var.deletion_protection
  skip_final_snapshot             = true
  copy_tags_to_snapshot           = true
  performance_insights_enabled    = false
  enabled_cloudwatch_logs_exports = []

  # Keep early iteration fast; you can switch to controlled windows later.
  apply_immediately = true

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-postgres" })
}
