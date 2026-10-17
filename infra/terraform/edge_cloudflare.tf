# Só com edge_mode = "cloudflare": Cloudflare (proxy, registro A para o Elastic IP) -> EC2 (Caddy na 443).
# Aqui: lista de IPs da Cloudflare, prefix lists gerenciadas por nós, Security Groups e o bucket privado de artefatos do front.
# Nada de S3 de site, CloudFront, OAC ou funções de CloudFront neste modo.

data "http" "cloudflare_v4" {
  count = local.use_cloudflare && var.cloudflare_fetch_ips ? 1 : 0
  url   = "https://www.cloudflare.com/ips-v4"

  request_headers = {
    Accept = "text/plain"
  }
}

data "http" "cloudflare_v6" {
  count = local.use_cloudflare && var.cloudflare_fetch_ips ? 1 : 0
  url   = "https://www.cloudflare.com/ips-v6"

  request_headers = {
    Accept = "text/plain"
  }
}

locals {
  cf_v4_fetched = local.use_cloudflare && var.cloudflare_fetch_ips ? [for l in split("\n", data.http.cloudflare_v4[0].response_body) : trimspace(l) if trimspace(l) != ""] : []
  cf_v6_fetched = local.use_cloudflare && var.cloudflare_fetch_ips ? [for l in split("\n", data.http.cloudflare_v6[0].response_body) : trimspace(l) if trimspace(l) != ""] : []

  # Resposta só vale se veio 200 e todo item é um CIDR do tipo certo; senão usa a lista das variáveis.
  # (Ternário e não &&: o Terraform não faz curto-circuito no &&, e data.http.*[0] não existe com a busca desligada.)
  cf_v4_ok = local.use_cloudflare && var.cloudflare_fetch_ips ? (
    data.http.cloudflare_v4[0].status_code == 200 && length(local.cf_v4_fetched) > 0 && alltrue([for c in local.cf_v4_fetched : can(cidrnetmask(c))])
  ) : false
  cf_v6_ok = local.use_cloudflare && var.cloudflare_fetch_ips ? (
    data.http.cloudflare_v6[0].status_code == 200 && length(local.cf_v6_fetched) > 0 && alltrue([for c in local.cf_v6_fetched : can(regex(":", c)) && can(cidrhost(c, 0))])
  ) : false

  cloudflare_v4    = local.cf_v4_ok ? local.cf_v4_fetched : var.cloudflare_ipv4_fallback
  cloudflare_v6    = local.cf_v6_ok ? local.cf_v6_fetched : var.cloudflare_ipv6_fallback
  cloudflare_cidrs = concat(local.cloudflare_v4, local.cloudflare_v6)

  # Cada regra de SG que usa uma prefix list conta max_entries (não o tamanho atual) contra a cota de regras do SG (60 por padrão).
  # 25 + 15 = 40 por porta: por isso a 443 e a 80 ficam em SGs diferentes (40 + 40 em um só estouraria 60).
  cf_v4_max = 25
  cf_v6_max = 15
}

# Prefix lists próprias (a AWS não publica uma da Cloudflare). Atualizam no próximo `terraform apply`.
resource "aws_ec2_managed_prefix_list" "cloudflare_v4" {
  count          = local.use_cloudflare ? 1 : 0
  name           = "moneylog-${var.environment}-cloudflare-v4"
  address_family = "IPv4"
  max_entries    = local.cf_v4_max

  dynamic "entry" {
    for_each = toset(local.cloudflare_v4)
    content {
      cidr        = entry.value
      description = "Cloudflare"
    }
  }

  lifecycle {
    precondition {
      condition     = length(local.cloudflare_v4) <= local.cf_v4_max
      error_message = "A Cloudflare publicou mais CIDRs IPv4 do que cf_v4_max em edge_cloudflare.tf. Aumente o limite (e confira a cota de regras por SG)."
    }
  }
}

resource "aws_ec2_managed_prefix_list" "cloudflare_v6" {
  count          = local.use_cloudflare ? 1 : 0
  name           = "moneylog-${var.environment}-cloudflare-v6"
  address_family = "IPv6"
  max_entries    = local.cf_v6_max

  dynamic "entry" {
    for_each = toset(local.cloudflare_v6)
    content {
      cidr        = entry.value
      description = "Cloudflare"
    }
  }

  lifecycle {
    precondition {
      condition     = length(local.cloudflare_v6) <= local.cf_v6_max
      error_message = "A Cloudflare publicou mais CIDRs IPv6 do que cf_v6_max em edge_cloudflare.tf. Aumente o limite (e confira a cota de regras por SG)."
    }
  }
}

# SG da 443: só a Cloudflare entra. Sem 22 e sem 8080 (o backend nem publica a porta fora do loopback).
resource "aws_security_group" "edge_https" {
  count       = local.use_cloudflare ? 1 : 0
  name        = "moneylog-${var.environment}-edge-https"
  description = "moneylog: 443 apenas dos CIDRs da Cloudflare"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "https_v4" {
  count             = local.use_cloudflare ? 1 : 0
  security_group_id = aws_security_group.edge_https[0].id
  description       = "Cloudflare IPv4 para o Caddy"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  prefix_list_id    = aws_ec2_managed_prefix_list.cloudflare_v4[0].id
}

resource "aws_vpc_security_group_ingress_rule" "https_v6" {
  count             = local.use_cloudflare ? 1 : 0
  security_group_id = aws_security_group.edge_https[0].id
  description       = "Cloudflare IPv6 para o Caddy"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  prefix_list_id    = aws_ec2_managed_prefix_list.cloudflare_v6[0].id
}

resource "aws_vpc_security_group_egress_rule" "edge_all" {
  count             = local.use_cloudflare ? 1 : 0
  security_group_id = aws_security_group.edge_https[0].id
  description       = "Saida (SSM, ECR, S3, provedor de IA, push)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# SG opcional da 80 (só para redirecionar para HTTPS), separado para não estourar a cota de regras.
resource "aws_security_group" "edge_http" {
  count       = local.use_cloudflare && var.cloudflare_allow_http ? 1 : 0
  name        = "moneylog-${var.environment}-edge-http"
  description = "moneylog: 80 apenas dos CIDRs da Cloudflare (redireciona para HTTPS)"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "http_v4" {
  count             = local.use_cloudflare && var.cloudflare_allow_http ? 1 : 0
  security_group_id = aws_security_group.edge_http[0].id
  description       = "Cloudflare IPv4 (redirect)"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  prefix_list_id    = aws_ec2_managed_prefix_list.cloudflare_v4[0].id
}

resource "aws_vpc_security_group_ingress_rule" "http_v6" {
  count             = local.use_cloudflare && var.cloudflare_allow_http ? 1 : 0
  security_group_id = aws_security_group.edge_http[0].id
  description       = "Cloudflare IPv6 (redirect)"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  prefix_list_id    = aws_ec2_managed_prefix_list.cloudflare_v6[0].id
}

# ---- Artefatos do front: zip do build, que a EC2 baixa pela role (scripts/deploy-frontend.sh, modo cloudflare) ----
resource "aws_s3_bucket" "artifacts" {
  count         = local.use_cloudflare ? 1 : 0
  bucket_prefix = "moneylog-${var.environment}-artifacts-"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  count                   = local.use_cloudflare ? 1 : 0
  bucket                  = aws_s3_bucket.artifacts[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  count  = local.use_cloudflare ? 1 : 0
  bucket = aws_s3_bucket.artifacts[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  count  = local.use_cloudflare ? 1 : 0
  bucket = aws_s3_bucket.artifacts[0].id

  rule {
    id     = "expira-builds-antigos"
    status = "Enabled"

    filter {
      prefix = "frontend/"
    }

    expiration {
      days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "artifacts_bucket" {
  count = local.use_cloudflare ? 1 : 0

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.artifacts[0].arn, "${aws_s3_bucket.artifacts[0].arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "artifacts" {
  count  = local.use_cloudflare ? 1 : 0
  bucket = aws_s3_bucket.artifacts[0].id
  policy = data.aws_iam_policy_document.artifacts_bucket[0].json
}
