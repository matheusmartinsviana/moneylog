# Só com edge_mode = "cloudfront". No modo "cloudflare" nada disto existe (o front é servido pelo Caddy na EC2).
# Front estático em S3 privado, servido só pelo CloudFront (OAC). O mesmo domínio atende a API (/v1/*) em outro origin: sem CORS.
resource "aws_s3_bucket" "frontend" {
  count = local.use_cloudfront ? 1 : 0

  bucket_prefix = "moneylog-${var.environment}-front-"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  count = local.use_cloudfront ? 1 : 0

  bucket                  = aws_s3_bucket.frontend[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  count = local.use_cloudfront ? 1 : 0

  bucket = aws_s3_bucket.frontend[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  count = local.use_cloudfront ? 1 : 0

  name                              = "moneylog-${var.environment}-front"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# SPA: rotas sem extensão voltam para /index.html. É uma Function no comportamento do front (e não custom_error_response), porque
# erro customizado vale para a distribuição inteira e transformaria o 404 da API em index.html.
resource "aws_cloudfront_function" "spa" {
  count = local.use_cloudfront ? 1 : 0

  name    = "moneylog-${var.environment}-spa"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      if (request.uri.indexOf('.') === -1) {
        request.uri = '/index.html';
      }
      return request;
    }
  JS
}

data "aws_cloudfront_cache_policy" "optimized" {
  count = local.use_cloudfront ? 1 : 0

  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  count = local.use_cloudfront ? 1 : 0

  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  count = local.use_cloudfront ? 1 : 0

  name = "Managed-AllViewerExceptHostHeader"
}

# Cabeçalhos de segurança do front: HSTS, nosniff, frame DENY, referrer e (opcional) CSP.
# Não use a política gerenciada: ela não aceita CSP, e a CSP do Angular depende de hashes (variável content_security_policy).
resource "aws_cloudfront_response_headers_policy" "security" {
  count = local.use_cloudfront ? 1 : 0

  name = "moneylog-${var.environment}-security"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    dynamic "content_security_policy" {
      for_each = var.content_security_policy == "" ? [] : [var.content_security_policy]
      content {
        content_security_policy = content_security_policy.value
        override                = true
      }
    }
  }
}

resource "aws_cloudfront_distribution" "app" {
  count = local.use_cloudfront ? 1 : 0

  enabled             = true
  comment             = "moneylog ${var.environment}"
  aliases             = var.domain_name == "" ? [] : [var.domain_name]
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  http_version        = "http2and3"

  origin {
    origin_id                = "frontend"
    domain_name              = aws_s3_bucket.frontend[0].bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend[0].id
  }

  origin {
    origin_id   = "backend"
    domain_name = aws_eip.backend.public_dns

    custom_origin_config {
      http_port              = 8080
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id           = "frontend"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized[0].id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security[0].id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa[0].arn
    }
  }

  # API e health: sem cache, com cookies, cabeçalhos e query string repassados ao backend.
  ordered_cache_behavior {
    path_pattern             = "/v1/*"
    target_origin_id         = "backend"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled[0].id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host[0].id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Sem domínio próprio: certificado padrão do CloudFront (*.cloudfront.net), HTTPS grátis.
  dynamic "viewer_certificate" {
    for_each = var.domain_name == "" ? [1] : []
    content {
      cloudfront_default_certificate = true
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.domain_name == "" ? [] : [1]
    content {
      acm_certificate_arn      = var.acm_certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  # Sem bloco `logging_config`: o termo de busca vai na URL (GET /v1/search?q=...) e o log padrão do CloudFront gravaria a query string.
  # Sem ALB: se um dia houver, access logs desligados ou sem query string (checklist do runbook).
}

data "aws_iam_policy_document" "frontend_bucket" {
  count = local.use_cloudfront ? 1 : 0

  statement {
    sid       = "CloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend[0].arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.app[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  count = local.use_cloudfront ? 1 : 0

  bucket = aws_s3_bucket.frontend[0].id
  policy = data.aws_iam_policy_document.frontend_bucket[0].json
}

moved {
  from = aws_s3_bucket.frontend
  to   = aws_s3_bucket.frontend[0]
}

moved {
  from = aws_s3_bucket_public_access_block.frontend
  to   = aws_s3_bucket_public_access_block.frontend[0]
}

moved {
  from = aws_s3_bucket_server_side_encryption_configuration.frontend
  to   = aws_s3_bucket_server_side_encryption_configuration.frontend[0]
}

moved {
  from = aws_cloudfront_origin_access_control.frontend
  to   = aws_cloudfront_origin_access_control.frontend[0]
}

moved {
  from = aws_cloudfront_function.spa
  to   = aws_cloudfront_function.spa[0]
}

moved {
  from = aws_cloudfront_response_headers_policy.security
  to   = aws_cloudfront_response_headers_policy.security[0]
}

moved {
  from = aws_cloudfront_distribution.app
  to   = aws_cloudfront_distribution.app[0]
}

moved {
  from = aws_s3_bucket_policy.frontend
  to   = aws_s3_bucket_policy.frontend[0]
}

# Bucket de backups do banco (T176): privado, cifrado, versionado, sem acesso público; retenção extra por lifecycle.
resource "aws_s3_bucket" "backups" {
  bucket_prefix = "moneylog-${var.environment}-backups-"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "expira-versoes-antigas"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # A retenção do app apaga o backup antigo (cria marcador de exclusão); aqui o marcador órfão também some.
  rule {
    id     = "limpa-marcadores-de-exclusao"
    status = "Enabled"

    filter {}

    expiration {
      expired_object_delete_marker = true
    }
  }
}

data "aws_iam_policy_document" "backups_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.backups.arn, "${aws_s3_bucket.backups.arn}/*"]

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

resource "aws_s3_bucket_policy" "backups" {
  bucket = aws_s3_bucket.backups.id
  policy = data.aws_iam_policy_document.backups_bucket.json
}
