locals {
  # Famílias Graviton têm "g" depois do número da geração (t4g, m7g, c7gd...). O resto é x86.
  arm_instance   = length(regexall("^[a-z]+[0-9]+g[a-z]*\\.", var.instance_type)) > 0
  arch           = local.arm_instance ? "arm64" : "x86_64"
  use_rds        = var.database_mode == "rds"
  use_cloudfront = var.edge_mode == "cloudfront"
  use_cloudflare = var.edge_mode == "cloudflare"
  use_ec2_db     = var.database_mode == "ec2"
  registry       = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com"
}

data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-${local.arch}"
}

# Logs do container no CloudWatch (5 GB de ingestão por mês no Always Free). Retenção curta para não crescer.
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/moneylog/${var.environment}/backend"
  retention_in_days = 14
}

resource "aws_ecr_repository" "backend" {
  name                 = "moneylog-backend"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Mantém as 10 imagens mais recentes"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backend" {
  name               = "moneylog-${var.environment}-backend"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# Acesso por Session Manager (sem SSH) e envio de comandos do deploy.
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.backend.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "backend" {
  statement {
    sid       = "ReadAppParameters"
    actions   = ["ssm:GetParametersByPath", "ssm:GetParameters", "ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_prefix}*"]
  }

  statement {
    sid       = "PullImage"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid       = "PullImageRepo"
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
    resources = [aws_ecr_repository.backend.arn]
  }

  statement {
    sid       = "BackupObjects"
    actions   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.backups.arn}/moneylog/*"]
  }

  statement {
    sid       = "BackupList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.backups.arn]
  }

  # Modo cloudflare: a EC2 baixa o zip do front do bucket de artefatos (só leitura).
  dynamic "statement" {
    for_each = local.use_cloudflare ? [1] : []
    content {
      sid       = "ReadFrontendArtifacts"
      actions   = ["s3:GetObject"]
      resources = ["${aws_s3_bucket.artifacts[0].arn}/frontend/*"]
    }
  }

  statement {
    sid       = "ContainerLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.backend.arn}:*"]
  }
}

# Só no modo rds: leitura da senha gerada pelo RDS (no modo ec2 a senha do banco é um parâmetro SSM).
data "aws_iam_policy_document" "rds_secret" {
  count = local.use_rds ? 1 : 0

  statement {
    sid       = "ReadDatabaseSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_db_instance.main[0].master_user_secret[0].secret_arn]
  }
}

resource "aws_iam_role_policy" "rds_secret" {
  count  = local.use_rds ? 1 : 0
  name   = "moneylog-rds-secret"
  role   = aws_iam_role.backend.id
  policy = data.aws_iam_policy_document.rds_secret[0].json
}

resource "aws_iam_role_policy" "backend" {
  name   = "moneylog-backend"
  role   = aws_iam_role.backend.id
  policy = data.aws_iam_policy_document.backend.json
}

resource "aws_iam_instance_profile" "backend" {
  name = "moneylog-${var.environment}-backend"
  role = aws_iam_role.backend.name
}

# A instância e o volume de dados precisam estar na mesma zona: ambos derivam desta sub-rede.
data "aws_subnet" "backend" {
  id = data.aws_subnets.default.ids[0]
}

locals {
  user_data_text = templatefile("${path.module}/user_data.sh.tftpl", {
    region     = var.region
    ssm_prefix = var.ssm_prefix
    registry   = local.registry
    repository = aws_ecr_repository.backend.name
    log_group  = aws_cloudwatch_log_group.backend.name

    database_mode         = var.database_mode
    db_name               = var.db_name
    db_username           = var.db_username
    edge_mode             = var.edge_mode
    domain_name           = var.domain_name
    front_script          = local.use_cloudflare ? file("${path.module}/../caddy/deploy-frontend.remote.sh") : ""
    caddyfile             = local.use_cloudflare ? file("${path.module}/../caddy/Caddyfile") : ""
    cloudflare_cidrs      = local.use_cloudflare ? join(" ", local.cloudflare_cidrs) : ""
    allow_http            = var.cloudflare_allow_http
    authenticated_origins = var.cloudflare_authenticated_origin_pulls
    csp                   = var.content_security_policy
    artifacts_bucket      = local.use_cloudflare ? aws_s3_bucket.artifacts[0].bucket : ""
    # ID do volume sem hífen: é como ele aparece em /dev/disk/by-id nas instâncias Nitro.
    data_volume_id = local.use_ec2_db ? replace(aws_ebs_volume.data[0].id, "-", "") : ""
  })
}

resource "aws_instance" "backend" {
  ami                         = data.aws_ssm_parameter.al2023.value
  instance_type               = var.instance_type
  subnet_id                   = data.aws_subnet.backend.id
  vpc_security_group_ids      = local.backend_sg_ids
  iam_instance_profile        = aws_iam_instance_profile.backend.name
  associate_public_ip_address = true
  monitoring                  = false

  # IMDSv2 obrigatório (protege as credenciais da role contra SSRF).
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 12
    encrypted   = true
  }

  # Modo cloudflare: o texto passa de 16 KB (limite do user_data); gzip em base64 é aceito pelo cloud-init.
  user_data        = local.use_cloudflare ? null : local.user_data_text
  user_data_base64 = local.use_cloudflare ? base64gzip(local.user_data_text) : null

  user_data_replace_on_change = false

  tags = {
    Name = "moneylog-${var.environment}-backend"
  }
}

# IP fixo: o CloudFront usa o DNS público da instância como origem (e, no modo cloudflare, o registro A da Cloudflare aponta para
# este IP), e o IP automático muda se ela for parada e iniciada.
# O IPv4 público é cobrado (~US$ 3,65/mês) com ou sem Elastic IP; o EIP associado não acrescenta custo.
resource "aws_eip" "backend" {
  instance = aws_instance.backend.id
  domain   = "vpc"
}

# ---- Modo ec2: volume de dados do Postgres, separado do disco do sistema, com snapshot diário (DLM) ----
resource "aws_ebs_volume" "data" {
  count             = local.use_ec2_db ? 1 : 0
  availability_zone = data.aws_subnet.backend.availability_zone
  size              = var.data_volume_size_gb
  type              = "gp3"
  encrypted         = true

  tags = {
    Name     = "moneylog-${var.environment}-pgdata"
    Snapshot = "moneylog-${var.environment}"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_volume_attachment" "data" {
  count        = local.use_ec2_db ? 1 : 0
  device_name  = "/dev/sdf"
  volume_id    = aws_ebs_volume.data[0].id
  instance_id  = aws_instance.backend.id
  force_detach = false
}

data "aws_iam_policy_document" "dlm_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["dlm.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "dlm" {
  count              = local.use_ec2_db ? 1 : 0
  name               = "moneylog-${var.environment}-dlm"
  assume_role_policy = data.aws_iam_policy_document.dlm_assume.json
}

resource "aws_iam_role_policy_attachment" "dlm" {
  count      = local.use_ec2_db ? 1 : 0
  role       = aws_iam_role.dlm[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}

# Snapshot do volume do Postgres todo dia, 7 retidos. Complementa o pg_dump para o S3 (o snapshot não é consistente a nível
# de aplicação: serve como recuperação de desastre; o pg_dump é a cópia restaurável com garantias).
resource "aws_dlm_lifecycle_policy" "pgdata" {
  count              = local.use_ec2_db ? 1 : 0
  description        = "moneylog ${var.environment}: snapshot diario do volume do Postgres"
  execution_role_arn = aws_iam_role.dlm[0].arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]
    target_tags = {
      Snapshot = "moneylog-${var.environment}"
    }

    schedule {
      name = "diario"
      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = ["06:00"]
      }
      retain_rule {
        count = 7
      }
      copy_tags = true
    }
  }
}
