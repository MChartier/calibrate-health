locals {
  common_tags = {
    App         = var.app_name
    Environment = var.environment
    NamePrefix  = var.name_prefix
  }
}

resource "aws_security_group" "this" {
  name        = "${var.name_prefix}-app-sg"
  description = "Public HTTPS ingress for ${var.name_prefix}"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP (ACME challenge + redirect)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-app-sg" })
}

data "aws_iam_policy_document" "instance_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instance" {
  name               = "${var.name_prefix}-instance-role"
  assume_role_policy = data.aws_iam_policy_document.instance_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ecr_readonly" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

data "aws_iam_policy_document" "instance_secrets_policy" {
  statement {
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.app_secret_arn, var.rds_master_secret_arn]
  }
}

resource "aws_iam_role_policy" "instance_secrets" {
  name   = "${var.name_prefix}-secrets-read"
  role   = aws_iam_role.instance.id
  policy = data.aws_iam_policy_document.instance_secrets_policy.json
}

resource "aws_iam_instance_profile" "this" {
  name = "${var.name_prefix}-instance-profile"
  role = aws_iam_role.instance.name
}

resource "aws_instance" "this" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [aws_security_group.this.id]
  iam_instance_profile        = aws_iam_instance_profile.this.name
  associate_public_ip_address = true

  # When the root volume size isn't specified, let the AMI snapshot decide the minimum size.
  # (Some AL2023 AMIs require >=30GB; hard-coding a smaller size causes a RunInstances error.)
  dynamic "root_block_device" {
    for_each = var.root_volume_size_gb == null ? [1] : []
    content {
      volume_type = "gp3"
    }
  }

  dynamic "root_block_device" {
    for_each = var.root_volume_size_gb == null ? [] : [1]
    content {
      volume_type = "gp3"
      volume_size = var.root_volume_size_gb
    }
  }

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    app_name           = var.app_name
    environment        = var.environment
    aws_region         = var.aws_region
    app_secret_arn     = var.app_secret_arn
    rds_secret_arn     = var.rds_master_secret_arn
    rds_address        = var.rds_address
    rds_port           = var.rds_port
    rds_db_name        = var.rds_db_name
    ecr_repository_url = var.ecr_repository_url
    deploy_tag         = var.deploy_tag
    compose_yaml       = var.compose_yaml
    caddyfile          = var.caddyfile
    deploy_script      = var.deploy_script
  })

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-host" })
}

resource "aws_eip" "this" {
  domain = "vpc"
  tags   = merge(local.common_tags, { Name = "${var.name_prefix}-eip" })
}

resource "aws_eip_association" "this" {
  instance_id   = aws_instance.this.id
  allocation_id = aws_eip.this.id
}
