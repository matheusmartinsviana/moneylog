variable "region" {
  description = "Região principal (EC2, RDS, S3). O certificado do CloudFront precisa estar em us-east-1."
  type        = string
  default     = "sa-east-1"
}

variable "environment" {
  description = "Nome do ambiente (vira tag e prefixo)."
  type        = string
  default     = "prod"
}

variable "domain_name" {
  description = "Domínio único do app (front e API no mesmo domínio, sem CORS). Ex.: app.exemplo.com"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ARN do certificado ACM em us-east-1 para o domínio (criado/validado pelo usuário)."
  type        = string
}

variable "instance_type" {
  description = "Tipo da EC2 do backend. t3.micro (x86) é elegível ao free tier; t4g.micro (ARM) exige imagem arm64."
  type        = string
  default     = "t3.micro"
}

variable "db_instance_class" {
  description = "Classe do RDS."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_name" {
  type    = string
  default = "moneylog"
}

variable "db_username" {
  description = "Usuário mestre do RDS. É também o usuário da aplicação e DONO do banco (necessário para CREATE EXTENSION unaccent)."
  type        = string
  default     = "moneylog"
}

variable "budget_limit_usd" {
  description = "Teto mensal do AWS Budgets em USD."
  type        = number
  default     = 15
}

variable "budget_alert_email" {
  description = "E-mail dos alertas de orçamento."
  type        = string
}

variable "github_repo" {
  description = "Repositório autorizado a fazer deploy via OIDC, no formato dono/repositorio."
  type        = string
}

variable "github_deploy_environment" {
  description = "Nome do GitHub Environment (com aprovação manual) que pode assumir a role de deploy."
  type        = string
  default     = "production"
}

variable "ssm_prefix" {
  description = "Prefixo dos parâmetros SSM com a configuração do app (um parâmetro por variável do .env.example)."
  type        = string
  default     = "/moneylog/prod"
}
