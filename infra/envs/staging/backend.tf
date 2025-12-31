terraform {
  backend "s3" {
    bucket         = "CHANGEME_TFSTATE_BUCKET"
    key            = "envs/staging/terraform.tfstate"
    region         = "us-west-2"
    dynamodb_table = "calibratehealth-terraform-locks"
    encrypt        = true
  }
}

