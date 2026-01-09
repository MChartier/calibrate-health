locals {
  lambda_name     = "${var.name_prefix}-db-secret-redeploy"
  event_rule_name = "${var.name_prefix}-db-secret-rotation"
}

data "archive_file" "lambda_zip" {
  type = "zip"
  source_content = <<-EOT
  import os
  import boto3

  ecs = boto3.client("ecs")

  def handler(event, _context):
    # Force a new ECS deployment after DB secret rotation so tasks refresh credentials.
    cluster = os.environ.get("CLUSTER_NAME")
    service = os.environ.get("SERVICE_NAME")
    secret_arn = os.environ.get("SECRET_ARN")

    if not cluster or not service:
      raise RuntimeError("CLUSTER_NAME and SERVICE_NAME must be set.")

    detail = event.get("detail") if isinstance(event, dict) else None
    event_secret = None
    if isinstance(detail, dict):
      params = detail.get("requestParameters")
      if isinstance(params, dict):
        event_secret = params.get("secretId")

    if not event_secret:
      resources = event.get("resources") if isinstance(event, dict) else None
      if isinstance(resources, list) and resources:
        event_secret = resources[0]

    secret_name = secret_arn.split(":secret:")[1] if secret_arn and ":secret:" in secret_arn else None
    matches_secret = (
      not secret_arn
      or not event_secret
      or event_secret == secret_arn
      or (secret_name and event_secret == secret_name)
    )

    if not matches_secret:
      print("Skipping event for unrelated secret:", event_secret)
      return {"skipped": True}

    version_stage = None
    staging_labels = None
    if isinstance(detail, dict):
      params = detail.get("requestParameters")
      if isinstance(params, dict):
        version_stage = params.get("versionStage")
        staging_labels = params.get("stagingLabels")

    if version_stage and version_stage != "AWSCURRENT":
      print("Skipping rotation stage:", version_stage)
      return {"skipped": True}

    if isinstance(staging_labels, list) and "AWSCURRENT" not in staging_labels:
      print("Skipping rotation without AWSCURRENT stage.")
      return {"skipped": True}

    ecs.update_service(cluster=cluster, service=service, forceNewDeployment=True)
    print("Forced new deployment for service:", service)
    return {"updated": True}
  EOT
  source_content_filename = "index.py"
  output_path             = "${path.module}/lambda.zip"
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  name               = substr("${var.name_prefix}-db-secret-redeploy", 0, 64)
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "force_redeploy" {
  statement {
    effect    = "Allow"
    actions   = ["ecs:UpdateService"]
    resources = [var.service_arn]
  }
}

resource "aws_iam_role_policy" "force_redeploy" {
  name   = substr("${var.name_prefix}-force-redeploy", 0, 128)
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.force_redeploy.json
}

resource "aws_lambda_function" "this" {
  function_name    = local.lambda_name
  role             = aws_iam_role.this.arn
  handler          = "index.handler"
  runtime          = "python3.11"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  timeout          = 30

  environment {
    variables = {
      CLUSTER_NAME = var.cluster_name
      SERVICE_NAME = var.service_name
      SECRET_ARN   = var.secret_arn
    }
  }
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${aws_lambda_function.this.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_event_rule" "secret_rotation" {
  name        = local.event_rule_name
  description = "Force ECS redeploy when Secrets Manager updates DB credentials."
  event_pattern = jsonencode({
    source = ["aws.secretsmanager"],
    "detail-type" = ["AWS API Call via CloudTrail"],
    detail = {
      eventSource = ["secretsmanager.amazonaws.com"],
      eventName   = ["UpdateSecretVersionStage"]
    }
  })
}

resource "aws_cloudwatch_event_target" "secret_rotation" {
  rule      = aws_cloudwatch_event_rule.secret_rotation.name
  target_id = "force-ecs-redeploy"
  arn       = aws_lambda_function.this.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.secret_rotation.arn
}
