locals {
  lambda_name     = "${var.name_prefix}-db-secret-redeploy"
  event_rule_name = "${var.name_prefix}-db-secret-rotation"
}

data "archive_file" "lambda_zip" {
  type = "zip"
  source_content = <<-EOT
  const AWS = require('aws-sdk');

  const ecs = new AWS.ECS();

  exports.handler = async (event) => {
    // Force a new ECS deployment after DB secret rotation so tasks refresh credentials.
    const cluster = process.env.CLUSTER_NAME;
    const service = process.env.SERVICE_NAME;
    const secretArn = process.env.SECRET_ARN;

    if (!cluster || !service) {
      throw new Error('CLUSTER_NAME and SERVICE_NAME must be set.');
    }

    const eventSecret = event?.detail?.requestParameters?.secretId
      ?? (Array.isArray(event?.resources) ? event.resources[0] : undefined);
    const secretName = secretArn ? secretArn.split(':secret:')[1] : undefined;
    const matchesSecret = !secretArn
      || !eventSecret
      || eventSecret === secretArn
      || (secretName && eventSecret === secretName);

    if (!matchesSecret) {
      console.log('Skipping event for unrelated secret:', eventSecret);
      return { skipped: true };
    }

    const versionStage = event?.detail?.requestParameters?.versionStage;
    const stagingLabels = event?.detail?.requestParameters?.stagingLabels;

    if (versionStage && versionStage !== 'AWSCURRENT') {
      console.log('Skipping rotation stage:', versionStage);
      return { skipped: true };
    }

    if (Array.isArray(stagingLabels) && !stagingLabels.includes('AWSCURRENT')) {
      console.log('Skipping rotation without AWSCURRENT stage.');
      return { skipped: true };
    }

    await ecs.updateService({ cluster, service, forceNewDeployment: true }).promise();
    console.log('Forced new deployment for service:', service);
    return { updated: true };
  };
  EOT
  source_content_filename = "index.js"
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
  runtime          = "nodejs18.x"
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
