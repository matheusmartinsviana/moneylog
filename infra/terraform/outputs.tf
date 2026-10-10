output "cloudfront_domain" {
  description = "Endereço do app (https://<valor>). Com domínio próprio, aponte o DNS (CNAME/ALIAS) para este valor."
  value       = aws_cloudfront_distribution.app.domain_name
}

output "frontend_bucket" {
  value = aws_s3_bucket.frontend.bucket
}

output "backups_bucket" {
  value = aws_s3_bucket.backups.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.app.id
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
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.app.domain_name}"
}

output "ssm_prefix" {
  value = var.ssm_prefix
}

output "log_group" {
  value = aws_cloudwatch_log_group.backend.name
}
