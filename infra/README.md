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

### Terraform state (recommended)

Terraform state is NOT committed to git. For portability across machines/worktrees, we store state in:

- S3 (state)
- DynamoDB (state locking)

This repo uses local, gitignored `backend.hcl` files (copied from `backend.hcl.example`) to hold the backend
configuration values without hard-coding them into the repo.

### 1) Bootstrap shared resources

```sh
cd infra/bootstrap
# Create a local backend config (gitignored).
# Bucket name is derived from your AWS account ID.
AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
TFSTATE_BUCKET="calibratehealth-tfstate-${AWS_ACCOUNT_ID}"

cp backend.hcl.example backend.hcl
# Edit backend.hcl and set `bucket = "${TFSTATE_BUCKET}"`

# First-time bootstrap: the state bucket/lock table do not exist yet, so run with local state.
terraform init -backend=false
terraform apply

# Then migrate bootstrap state into the S3 backend for future applies (recommended).
terraform init -backend-config=backend.hcl -migrate-state
```

Re-running bootstrap later (new machine/worktree):

```sh
cd infra/bootstrap
terraform init -backend-config=backend.hcl -reconfigure
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

Each environment has a committed `backend.hcl.example`. Copy it to `backend.hcl` (gitignored) and set the bucket/table
to the bootstrap outputs (`terraform_state_bucket_name` and `terraform_lock_table_name`).

```sh
cd infra/envs/staging
cp backend.hcl.example backend.hcl
terraform init -backend-config=backend.hcl -reconfigure

cd ../prod
cp backend.hcl.example backend.hcl
terraform init -backend-config=backend.hcl -reconfigure
```

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
