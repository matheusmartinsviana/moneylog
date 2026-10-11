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

  validation {
    condition     = var.edge_mode != "cloudflare" || var.domain_name != ""
    error_message = "edge_mode = \"cloudflare\" exige domain_name (o nome que você aponta na Cloudflare, ex.: app.exemplo.com)."
  }
}

variable "acm_certificate_arn" {
  description = "ARN do certificado ACM em us-east-1 para o domínio próprio. Obrigatório se domain_name estiver preenchido; vazio caso contrário."
  type        = string
  default     = ""

  validation {
    condition     = var.edge_mode == "cloudflare" ? var.acm_certificate_arn == "" : (var.domain_name == "") == (var.acm_certificate_arn == "")
    error_message = "edge_mode = \"cloudfront\": preencha domain_name e acm_certificate_arn juntos, ou deixe os dois vazios (domínio *.cloudfront.net). edge_mode = \"cloudflare\": acm_certificate_arn deve ficar vazio (o certificado é o Origin Certificate da Cloudflare, carregado no SSM)."
  }
}

variable "edge_mode" {
  description = "Quem fica na frente do app. cloudflare (recomendado se o domínio já está na Cloudflare): Cloudflare (proxy) -> EC2 com Caddy na 443, sem S3 de site, CloudFront nem OAC; exige domain_name. cloudfront: S3 + CloudFront + EC2 (porta 8080 só para o CloudFront, HTTP na origem)."
  type        = string
  default     = "cloudfront"

  validation {
    condition     = contains(["cloudflare", "cloudfront"], var.edge_mode)
    error_message = "edge_mode deve ser \"cloudflare\" ou \"cloudfront\"."
  }
}

variable "cloudflare_fetch_ips" {
  description = "edge_mode = cloudflare: true busca https://www.cloudflare.com/ips-v4 e ips-v6 a cada plan/apply (data source http); resposta inválida cai na lista das variáveis abaixo. false não faz chamada de rede (usa só as variáveis). Falha de rede com true derruba o plan: nesse caso use false."
  type        = bool
  default     = true
}

variable "cloudflare_ipv4_fallback" {
  description = "CIDRs IPv4 da Cloudflare usados quando cloudflare_fetch_ips = false ou a busca falha. Confira em https://www.cloudflare.com/ips-v4 (conferido em 2026-10; mudam raramente)."
  type        = list(string)
  default = [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
    "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
    "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  ]
}

variable "cloudflare_ipv6_fallback" {
  description = "CIDRs IPv6 da Cloudflare usados quando cloudflare_fetch_ips = false ou a busca falha. Confira em https://www.cloudflare.com/ips-v6."
  type        = list(string)
  default = [
    "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
    "2a06:98c0::/29", "2c0f:f248::/32",
  ]
}

variable "cloudflare_allow_http" {
  description = "edge_mode = cloudflare: abre também a porta 80 (só para os CIDRs da Cloudflare) e o Caddy responde com redirecionamento para HTTPS. Desnecessário se a Cloudflare está com Always Use HTTPS; padrão false."
  type        = bool
  default     = false
}

variable "cloudflare_authenticated_origin_pulls" {
  description = "edge_mode = cloudflare: exige certificado de cliente da Cloudflare (Authenticated Origin Pulls, mTLS) no Caddy. Endurecimento extra: só ligue depois de ativar 'Authenticated Origin Pulls' na Cloudflare, senão o site para de responder (erro 525/526)."
  type        = bool
  default     = false
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
