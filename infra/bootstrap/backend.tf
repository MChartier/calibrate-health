terraform {
  # Backend configuration is provided via `-backend-config=backend.hcl` so that
  # bucket/table details stay out of git while still allowing remote state.
  backend "s3" {}
}

