# VPC padrão da conta: evita NAT Gateway (custo) e mantém o desenho mínimo. O RDS fica sem acesso público.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Lista gerenciada pela AWS com os IPs de origem do CloudFront.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  count = local.use_cloudfront ? 1 : 0
  name  = "com.amazonaws.global.cloudfront.origin-facing"
}

# Só com edge_mode = "cloudfront" (no modo cloudflare os SGs estão em edge_cloudflare.tf).
# Backend: só o CloudFront alcança a porta 8080. Sem porta 22 (acesso por SSM Session Manager).
# A lista do CloudFront ocupa ~55 regras do SG (cota padrão: 60 por SG); não adicione outras regras de entrada neste SG.
resource "aws_security_group" "backend" {
  count       = local.use_cloudfront ? 1 : 0
  name        = "moneylog-${var.environment}-backend"
  description = "Backend moneylog: entrada apenas do CloudFront na 8080"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "CloudFront para o Spring Boot"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront[0].id]
  }

  egress {
    description = "Saida (SSM, ECR, S3, provedor de IA, push)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "database" {
  count       = var.database_mode == "rds" ? 1 : 0
  name        = "moneylog-${var.environment}-database"
  description = "RDS moneylog: entrada apenas do backend na 5432"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "Backend para o Postgres"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = local.backend_sg_ids
  }
}

moved {
  from = aws_security_group.backend
  to   = aws_security_group.backend[0]
}

locals {
  # SGs anexados à EC2 (e usados como origem de entrada no RDS), conforme o modo de borda.
  backend_sg_ids = local.use_cloudfront ? [aws_security_group.backend[0].id] : compact([aws_security_group.edge_https[0].id, var.cloudflare_allow_http ? aws_security_group.edge_http[0].id : ""])
}
