terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.4"
    }
  }

  # Estado remoto: configure no primeiro `terraform init` (veja docs/operacao/deploy-aws.md, passo 5).
  # Exemplo (NÃO aplicado): -backend-config="bucket=..." -backend-config="key=moneylog/prod.tfstate" -backend-config="region=sa-east-1"
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      app = "moneylog"
      env = var.environment
    }
  }
}

provider "aws" {
  alias  = "ses"
  region = var.mail_region

  default_tags {
    tags = {
      app = "moneylog"
      env = var.environment
    }
  }
}
