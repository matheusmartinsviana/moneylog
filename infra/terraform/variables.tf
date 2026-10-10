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
  description = "Domínio próprio do app (front e API no mesmo domínio, sem CORS). Vazio = usa o domínio gratuito *.cloudfront.net (HTTPS incluso)."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN do certificado ACM em us-east-1 para o domínio próprio. Obrigatório se domain_name estiver preenchido; vazio caso contrário."
  type        = string
  default     = ""

  validation {
    condition     = (var.domain_name == "") == (var.acm_certificate_arn == "")
    error_message = "Preencha domain_name e acm_certificate_arn juntos, ou deixe os dois vazios (domínio *.cloudfront.net)."
  }
}

variable "database_mode" {
  description = "ec2 (padrão recomendado): Postgres 17 no Docker Compose da própria EC2, volume EBS próprio e snapshots diários, SEM RDS. rds: RDS PostgreSQL gerenciado (~US$ 13 a 15/mês a mais, ADR-005)."
  type        = string
  default     = "ec2"

  validation {
    condition     = contains(["ec2", "rds"], var.database_mode)
    error_message = "database_mode deve ser \"ec2\" ou \"rds\"."
  }
}

variable "instance_type" {
  description = "Tipo da EC2 do backend. t3.micro (x86, 1 GB) é o padrão. t4g.micro (ARM, mais barata) exige imagem do backend arm64: PLATFORM=linux/arm64 em scripts/deploy-backend.sh. Os tipos Graviton (letra g, ex.: t4g, m7g) escolhem a AMI arm64 sozinhos."
  type        = string
  default     = "t3.micro"
}

variable "data_volume_size_gb" {
  description = "Tamanho do volume EBS gp3 do Postgres (só database_mode = ec2). Cobrado por GB provisionado."
  type        = number
  default     = 10
}

variable "content_security_policy" {
  description = "Cabeçalho Content-Security-Policy do front. Vazio = não envia CSP. O index.html do Angular tem 2 scripts inline: a CSP precisa dos hashes deles (scripts/deploy-frontend.sh --print-csp imprime uma CSP pronta). Teste no navegador antes de ligar."
  type        = string
  default     = ""
}

variable "db_instance_class" {
  description = "Classe do RDS (só database_mode = rds)."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_name" {
  type    = string
  default = "moneylog"
}

variable "db_username" {
  description = "Usuário da aplicação e DONO do banco (necessário para CREATE EXTENSION unaccent). No RDS é o usuário mestre; no modo ec2 é o POSTGRES_USER e deve ser o mesmo valor do parâmetro SSM DB_USER."
  type        = string
  default     = "moneylog"
}

variable "budget_limit_usd" {
  description = "Teto mensal do AWS Budgets em USD (uso bruto, sem descontar créditos: avisa o ritmo de consumo dos créditos)."
  type        = number
  default     = 10
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
