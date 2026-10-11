output "edge_mode" {
  value = var.edge_mode
}

output "cloudfront_domain" {
  description = "Modo cloudfront: endereço do app (https://<valor>). Com domínio próprio, aponte o DNS (CNAME/ALIAS) para este valor. Vazio no modo cloudflare."
  value       = local.use_cloudfront ? aws_cloudfront_distribution.app[0].domain_name : ""
}

output "frontend_bucket" {
  description = "Modo cloudfront: bucket do site. Vazio no modo cloudflare."
  value       = local.use_cloudfront ? aws_s3_bucket.frontend[0].bucket : ""
}

output "elastic_ip" {
  description = "IP elástico da EC2. No modo cloudflare, é o valor do registro A (proxy ligado) na Cloudflare. NÃO publique este IP."
  value       = aws_eip.backend.public_ip
}

output "artifacts_bucket" {
  description = "Modo cloudflare: bucket privado com o zip do build do front (scripts/deploy-frontend.sh). Vazio no modo cloudfront."
  value       = local.use_cloudflare ? aws_s3_bucket.artifacts[0].bucket : ""
}

output "cloudflare_cidr_count" {
  description = "Modo cloudflare: quantos CIDRs (IPv4 + IPv6) entraram nas prefix lists."
  value       = local.use_cloudflare ? length(local.cloudflare_cidrs) : 0
}

output "cloudflare_origin_cert_parameters" {
  description = "Modo cloudflare: parâmetros SSM (SecureString) que VOCÊ carrega com `aws ssm put-parameter` (não passam pelo Terraform)."
  value       = local.use_cloudflare ? ["${var.ssm_prefix}/edge/origin-pem", "${var.ssm_prefix}/edge/origin-key"] : []
}

output "deploy_commands" {
  description = "Comandos de deploy prontos para este modo (preencha AWS_REGION)."
  value = local.use_cloudflare ? join("\n", [
    "export AWS_REGION=${var.region} INSTANCE_ID=${aws_instance.backend.id} ECR_REPOSITORY=${aws_ecr_repository.backend.repository_url}",
    "scripts/deploy-backend.sh",
    "EDGE_MODE=cloudflare ARTIFACTS_BUCKET=${aws_s3_bucket.artifacts[0].bucket} DOMAIN=${var.domain_name} scripts/deploy-frontend.sh",
    "scripts/deploy-frontend.sh --rollback   # com as mesmas variáveis",
    ]) : join("\n", [
    "export AWS_REGION=${var.region} INSTANCE_ID=${aws_instance.backend.id} ECR_REPOSITORY=${aws_ecr_repository.backend.repository_url}",
    "scripts/deploy-backend.sh",
    "S3_BUCKET=${aws_s3_bucket.frontend[0].bucket} CLOUDFRONT_DISTRIBUTION_ID=${aws_cloudfront_distribution.app[0].id} scripts/deploy-frontend.sh",
  ])
}

output "backups_bucket" {
  value = aws_s3_bucket.backups.bucket
}

output "cloudfront_distribution_id" {
  description = "Modo cloudfront. Vazio no modo cloudflare."
  value       = local.use_cloudfront ? aws_cloudfront_distribution.app[0].id : ""
}

output "ecr_repository" {
  value = aws_ecr_repository.backend.repository_url
}

output "backend_instance_id" {
  description = "Use com `aws ssm start-session --target <id>` (sem SSH)."
  value       = aws_instance.backend.id
}

output "github_deploy_role_arn" {
  description = "Vai para a variável AWS_DEPLOY_ROLE_ARN do GitHub Environment (não é segredo)."
  value       = aws_iam_role.github_deploy.arn
}

output "database_endpoint" {
  description = "Endpoint do RDS (vazio no modo ec2: o DB_URL é jdbc:postgresql://postgres:5432/<db_name>)."
  value       = var.database_mode == "rds" ? aws_db_instance.main[0].address : ""
}

output "database_secret_arn" {
  description = "Secrets Manager com a senha do usuário mestre; copie para o parâmetro SSM DB_PASSWORD."
  value       = var.database_mode == "rds" ? aws_db_instance.main[0].master_user_secret[0].secret_arn : ""
}

output "app_url" {
  description = "URL do app (use em MONEYLOG_ALLOWED_ORIGINS)."
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.app[0].domain_name}"
}

output "ssm_prefix" {
  value = var.ssm_prefix
}

output "log_group" {
  value = aws_cloudwatch_log_group.backend.name
}
