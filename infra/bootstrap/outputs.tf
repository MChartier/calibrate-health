output "aws_account_id" {
  description = "AWS account ID that owns the provisioned resources."
  value       = data.aws_caller_identity.current.account_id
}

output "terraform_state_bucket_name" {
  description = "S3 bucket name used for Terraform remote state."
  value       = aws_s3_bucket.tf_state.bucket
}

output "terraform_lock_table_name" {
  description = "DynamoDB table name used for Terraform state locking."
  value       = aws_dynamodb_table.tf_locks.name
}

output "route53_zone_id" {
  description = "Route 53 hosted zone ID for the app domain."
  value       = aws_route53_zone.primary.zone_id
}

output "route53_nameservers" {
  description = "Nameserver delegation set; configure these at Porkbun for calibratehealth.app."
  value       = aws_route53_zone.primary.name_servers
}

output "ecr_repository_url" {
  description = "ECR repository URL for the app image."
  value       = aws_ecr_repository.app.repository_url
}

output "github_oidc_provider_arn" {
  description = "OIDC provider ARN for GitHub Actions."
  value       = aws_iam_openid_connect_provider.github_actions.arn
}

output "github_build_role_arn" {
  description = "IAM role ARN assumed by GitHub Actions to push images to ECR."
  value       = aws_iam_role.github_build.arn
}

output "github_deploy_staging_role_arn" {
  description = "IAM role ARN assumed by GitHub Actions to deploy to staging (ECS)."
  value       = aws_iam_role.github_deploy_staging.arn
}

output "github_deploy_prod_role_arn" {
  description = "IAM role ARN assumed by GitHub Actions to deploy to prod (ECS)."
  value       = aws_iam_role.github_deploy_prod.arn
}
