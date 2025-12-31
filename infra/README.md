# AWS Deployment (Terraform + EC2 + RDS)

This repo deploys `calibratehealth.app` using:

- EC2 (ARM/Graviton) running `docker compose`
- RDS Postgres (one per environment)
- Route 53 for DNS
- Caddy for HTTPS (Let's Encrypt) and staging basic auth
- GitHub Actions for CI/CD (multi-arch images to GHCR + ECR; deploy via SSM)

## High-Level Flow

1) `infra/bootstrap` creates shared/global resources:
   - Terraform state bucket + lock table
   - Route 53 hosted zone
   - ECR repository
   - GitHub OIDC provider + IAM roles for CI/CD

2) `infra/envs/staging` + `infra/envs/prod` create per-environment resources:
   - VPC + subnets
   - EC2 instance + Elastic IP + SSM
   - RDS Postgres (private)
   - Route 53 records pointing to the Elastic IP
   - Secrets Manager secret placeholders for app runtime config

## One-Time Setup

### 1) Bootstrap shared resources

```sh
cd infra/bootstrap
terraform init
terraform apply
```

Important outputs:
- `route53_nameservers` (set these at Porkbun)
- `terraform_state_bucket_name` + `terraform_lock_table_name` (used for env state)
- `github_*_role_arn` (set as GitHub Actions secrets)

### 2) Delegate DNS from Porkbun -> Route 53

In Porkbun for `calibratehealth.app`, set the nameservers to the `route53_nameservers` output.
Propagation can take a bit; Route 53 records will start working after delegation is live.

### 3) Initialize remote state for each env

The `backend.tf` files under `infra/envs/*` contain placeholder bucket names.
Either edit them, or override via `-backend-config`:

```sh
cd infra/envs/staging
terraform init \
  -backend-config="bucket=<terraform_state_bucket_name>" \
  -backend-config="dynamodb_table=<terraform_lock_table_name>"
```

Repeat for `infra/envs/prod` (key differs).

### 4) Apply staging + prod infra

```sh
cd infra/envs/staging
terraform apply

cd ../prod
terraform apply
```

## Secrets Manager: required JSON payloads

Each environment creates an empty secret:

- `calibratehealth/staging/app`
- `calibratehealth/prod/app`

Populate them in AWS Secrets Manager as JSON:

Production (`calibratehealth/prod/app`):

```json
{
  "session_secret": "replace-with-random",
  "caddy_email": "you@example.com"
}
```

Staging (`calibratehealth/staging/app`):

```json
{
  "session_secret": "replace-with-random",
  "caddy_email": "you@example.com",
  "basic_auth_user": "staging",
  "basic_auth_hash": "$2a$..."
}
```

To generate `basic_auth_hash`:

```sh
docker run --rm caddy:2.8-alpine caddy hash-password --plaintext 'your-password'
```

## GitHub Actions configuration

In the GitHub repo settings, add secrets:

- `AWS_ROLE_ARN_BUILD` -> `github_build_role_arn` output
- `AWS_ROLE_ARN_DEPLOY_STAGING` -> `github_deploy_staging_role_arn` output
- `AWS_ROLE_ARN_DEPLOY_PROD` -> `github_deploy_prod_role_arn` output

Also create a GitHub Environment named `production` and require reviewers.

## Deploying

- Staging: push to `master` (builds multi-arch image, pushes to GHCR+ECR, deploys to staging via SSM).
- Prod: run the "Deploy Prod" workflow (retags the chosen `sha-*` image to `prod` in ECR, then deploys via SSM).
