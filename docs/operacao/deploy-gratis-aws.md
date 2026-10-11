# Guia: publicar o moneylog na AWS pelo menor custo possível

**Status: NADA FOI EXECUTADO na AWS.** Tudo aqui foi escrito e validado localmente (`terraform fmt/validate`, `bash -n`, `shellcheck`, `docker compose config`), sem conta e sem credenciais. Os comandos são os que **você** roda. Este guia **complementa** `deploy-aws.md` (roteiro original, com RDS) e a ADR-005; onde houver conflito, vale este guia (decisão: EC2 sem RDS como padrão).

## 0. Resumo honesto

- **Grátis de verdade, para sempre, só o que é "Always Free"**: CloudFront (1 TB de saída e 10 milhões de requisições por mês), Systems Manager (Parameter Store Standard e Session Manager), CloudWatch Logs (até 5 GB de ingestão), DLM, AWS Budgets (2 primeiros orçamentos). O front inteiro cabe aí.
- **Contas novas (depois de julho/2025) não têm os "12 meses grátis" de EC2/RDS/S3.** Recebem créditos (US$ 100 + até US$ 100 por tarefas de onboarding). O backend e o banco **consomem crédito**, e depois **cobram**.
- **Custo zero absoluto não é possível** para Spring Boot + Postgres (seção 2, arquitetura D).
- **Recomendação: arquitetura A** (S3 + CloudFront + 1 EC2 com Docker Compose rodando backend e Postgres 17, sem RDS, sem ALB): **~US$ 12 a 14 por mês**, ou seja, **~7 a 8 meses com os US$ 100** e **~14 a 16 meses com US$ 200**.
- **Bloqueios antes de colocar dado real** (seção 7): 2FA/TOTP não existe no app, e o trecho CloudFront -> EC2 trafega em HTTP (precisa de HTTPS na origem, que exige domínio próprio).

> **Novo (2026-10-10): Cloudflare na frente.** Se o domínio já está na Cloudflare, use `edge_mode = "cloudflare"` e siga a **seção 11** (HTTPS de ponta a ponta, sem CloudFront nem S3 de site, WAF e rate limit grátis). Ela resolve o bloqueio "HTTPS na origem" da seção 7. O restante deste guia continua valendo para o modo `cloudfront` e para tudo que é comum (parâmetros SSM, deploy do backend, backup, zerar/restaurar). **O bloqueio do 2FA/TOTP continua nos dois modos.**

## 1. O que é grátis, o que consome crédito, o que cobra

Preços de lista de `us-east-1`, a **conferir no console** (seção 9). `sa-east-1` (São Paulo) costuma ser bem mais cara em EC2/EBS.

| Item da nossa stack | Situação em conta nova | Valor aproximado |
|---|---|---|
| CloudFront (HTTPS em `*.cloudfront.net`, 1 TB e 10 M req/mês) | **Grátis (Always Free)** | US$ 0 |
| Invalidação de cache (`/*`) | Grátis nos primeiros 1.000 caminhos/mês | US$ 0 |
| Certificado ACM público (domínio próprio) | **Grátis** | US$ 0 |
| SSM Parameter Store (Standard) e Session Manager | **Grátis** | US$ 0 |
| DLM (snapshots agendados) | Grátis (paga o armazenamento do snapshot) | ver EBS |
| AWS Budgets | 2 primeiros grátis | US$ 0 |
| CloudWatch Logs | Grátis até 5 GB de ingestão/mês; retenção de 14 dias no Terraform | US$ 0 no nosso volume |
| Transferência de saída da EC2 | 100 GB/mês agregados grátis | US$ 0 |
| S3 (front ~50 MB, backups < 1 GB) | **Consome crédito**, depois centavos | ~US$ 0,05 a 0,30 |
| ECR (imagem ~150 MB comprimida, 10 versões) | Consome crédito, centavos | ~US$ 0,10 a 0,20 |
| **EC2 t3.micro** (2 vCPU, 1 GB) | **Consome crédito**, depois cobra | ~US$ 7,60 (`t4g.micro`: ~US$ 6,10) |
| **IPv4 público da EC2** (cobrado desde 02/2024) | Consome crédito, depois cobra | ~US$ 3,65 |
| **EBS gp3** (12 GB sistema + 10 GB dados) | Consome crédito, depois cobra | ~US$ 1,80 |
| Snapshots diários do volume de dados (7 retidos, incrementais) | Consome crédito | ~US$ 0,10 a 0,50 |
| **RDS db.t3.micro** + 20 GB (só arquitetura B) | **Consome crédito**, depois cobra | ~US$ 12,40 + US$ 2,30 + US$ 0,40 (segredo) |
| Route 53 (zona hospedada, só com domínio próprio) | Cobra | ~US$ 0,50/mês (DNS externo = US$ 0) |
| Registro de domínio | Cobra, e em geral **não aceita crédito** | ~US$ 12 a 15/ano |
| ALB | **EVITAR** | ~US$ 16+/mês |
| NAT Gateway | **EVITAR** | ~US$ 32+/mês |

Contas novas: o plano **Free** dura até 6 meses ou até os créditos acabarem (o que vier primeiro) e **bloqueia alguns serviços/tipos de instância**; no plano **Pago** os créditos continuam valendo e depois vira pay-as-you-go. Para manter o app no ar depois dos 6 meses, será preciso migrar para o plano Pago (os créditos restantes seguem). Confira no console quais tipos de instância o plano Free libera.

## 2. Arquiteturas e custo mensal

Estimativas por mês (730 h), `us-east-1`, sem domínio próprio. "Meses de crédito" = crédito dividido pelo custo mensal (não conta que o plano Free termina em 6 meses nem que os US$ 100 extras dependem das tarefas de onboarding).

| | Arquitetura | Custo/mês | US$ 100 duram | US$ 200 duram |
|---|---|---|---|---|
| **A** (recomendada) | S3 + CloudFront + **1 EC2 t3.micro** (backend + Postgres 17 no compose) + backup em S3, sem RDS, sem ALB | **~US$ 14** (t4g.micro ARM: ~US$ 12,50) | **~7 meses** (ARM: ~8) | **~14 meses** (ARM: ~16) |
| B | A + **RDS db.t3.micro** no lugar do Postgres do compose | **~US$ 27** | ~3,5 meses | ~7 meses |
| C | **Lightsail** 1 a 2 GB com compose (front pode ficar em S3+CloudFront) | ~US$ 7 a 12 (+ 90 dias grátis no plano de US$ 3,50, pequeno demais) | ~8 a 14 meses | ~16 a 28 meses |
| D | "custo zero" com Lambda/Always Free | impossível sem reescrever | n/a | n/a |

Composição de A: EC2 7,60 + IPv4 3,65 + EBS 1,80 + snapshots ~0,30 + S3/ECR ~0,40 = ~US$ 13,75.

**Por que não B como padrão:** o RDS dobra o custo e acrescenta backup/patch gerenciados que um app de uso pessoal consegue cobrir com o `pg_dump` diário em S3 + snapshot do EBS. O Terraform suporta as duas coisas (`database_mode = "rds"`).

**Por que não C:** o Lightsail não tem role de instância (o backup para o S3 precisaria de uma chave de acesso estática), não aceita a lista de IPs do CloudFront no firewall (a porta da API ficaria aberta à internet, protegida só pelo JWT), 512 MB não roda Spring Boot + Postgres, e o Terraform deste repositório não o cobre. Só vale se a conta AWS não for opção.

**Por que D não serve:** o backend é uma aplicação Spring Boot com JVM e um Postgres relacional com migrações Flyway e extensão `unaccent`. Lambda (1 M requisições/mês grátis) teria partida a frio de vários segundos para uma JVM e **não resolve o banco**: DynamoDB (25 GB grátis) é outro modelo de dados (exigiria reescrever a camada `infra` inteira), e o Postgres gerenciado mais barato (RDS, Aurora) não é grátis. A única forma de custo zero é rodar fora da AWS (no seu computador, ou em um provedor com camada gratuita, que não verifiquei), o que foge do alvo.

### Recomendação e riscos da A

| Risco | Mitigação já no repositório | O que falta |
|---|---|---|
| **Uma instância só** (sem alta disponibilidade; reiniciar = poucos minutos fora) | `restart: unless-stopped`, IP fixo (EIP), volume de dados separado e `prevent_destroy` | Aceitar. Para uso pessoal é razoável |
| **Perda de dados** (volume corrompido, erro humano) | `pg_dump` diário cifrado para o S3 (job do backend), versionamento + lifecycle no bucket, **snapshot EBS diário (DLM, 7 retidos)**, dump de segurança antes de zerar | **Teste de restauração antes de usar dado real** (seção 8). Chave de cifra guardada fora da AWS |
| **Restaurar backup cifrado** | Cifra AES-256-GCM no job | **Lacuna:** não há CLI para descriptografar fora do app (`backup.md`). Sem a CLI, ou deixe `BACKUP_ENCRYPTION_KEY` vazia (o bucket já é privado e cifrado em repouso, SSE-S3) ou restaure pelo próprio backend |
| **1 GB de RAM** (JVM + Postgres) | Container do backend limitado a 640 MB (heap ~480 MB), swap de 1 GB | Se der OOM, subir para `t3.small` (~US$ 15/mês) |
| **Patches do Postgres/SO** | `postgres:17` tem tag móvel (atualiza minor ao recriar), AL2023 | Rotina mensal: `dnf update`, recriar container |
| **Custo estourar** | Budget com alerta em 50/80/100% do uso bruto (sem descontar crédito) | Confirmar o e-mail do alerta |
| **HTTP entre CloudFront e EC2** | SG só aceita a lista de IPs do CloudFront | Ver seção 7, item "HTTPS na origem" |

## 3. Pré-requisitos (uma vez)

1. Conta AWS nova. **Ative MFA no root** e não use o root no dia a dia: crie um usuário administrador (IAM Identity Center/SSO é o melhor; `aws configure sso`).
2. Ferramentas locais: AWS CLI v2, Terraform >= 1.9, Docker (com `buildx`), Node 24, `openssl`, `python3`.
3. **Escolhas do dono** (seção 10): região, x86 ou ARM, domínio próprio ou `*.cloudfront.net`.
4. Bucket do estado do Terraform (S3 pelo console ou CLI, centavos). Exemplo em `us-east-1`:
   ```
   export AWS_REGION=us-east-1
   aws s3api create-bucket --bucket SEU-BUCKET-TFSTATE --region $AWS_REGION
   aws s3api put-bucket-versioning --bucket SEU-BUCKET-TFSTATE --versioning-configuration Status=Enabled
   aws s3api put-public-access-block --bucket SEU-BUCKET-TFSTATE --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
   ```
   (em outras regiões acrescente `--create-bucket-configuration LocationConstraint=$AWS_REGION`).
5. Variáveis do Terraform:
   ```
   cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars   # edite: região, e-mail do orçamento, github_repo
   ```
   Padrão: `database_mode = "ec2"`, `instance_type = "t3.micro"`, sem domínio (usa `*.cloudfront.net`). Para ARM: `instance_type = "t4g.micro"` **e** construa a imagem com `PLATFORM=linux/arm64`.

## 4. Criar a infraestrutura (você executa)

```
cd infra/terraform
terraform init -backend-config="bucket=SEU-BUCKET-TFSTATE" -backend-config="key=moneylog/prod.tfstate" -backend-config="region=$AWS_REGION"
terraform plan -out=tfplan        # leia TUDO. Confira: sem RDS, sem ALB, sem NAT
terraform apply tfplan
terraform output
```

O que sobe no modo `ec2`: S3 do front (privado, OAC), CloudFront (`/` -> S3, `/v1/*` -> EC2 porta 8080, sem cache e com cookies/cabeçalhos/query repassados), função de SPA, política de cabeçalhos (HSTS, nosniff, frame DENY, referrer; CSP opcional), ECR, EC2 (IMDSv2, role, sem SSH, SG só com a prefix list do CloudFront), **EIP**, volume EBS de dados cifrado (`prevent_destroy`) + DLM, bucket de backups (privado, versionado, lifecycle), grupo de logs, Budgets e OIDC do GitHub. Anote `app_url`, `frontend_bucket`, `cloudfront_distribution_id`, `ecr_repository`, `backend_instance_id`, `backups_bucket`, `log_group`.

A instância executa `user_data` na primeira partida: instala Docker e o plugin Compose (versão fixa, SHA-256 conferido), cria 1 GB de swap, formata/monta o volume de dados em `/opt/moneylog/pgdata`, grava `/opt/moneylog/docker-compose.yml` e `/opt/moneylog/deploy.sh`. **Conferir no console** (EC2 > Instâncias > Monitor e solucionar problemas > Log do sistema) que terminou sem erro; se o `user_data` falhar, o arquivo `/var/log/cloud-init-output.log` (via Session Manager) diz por quê.

> **Domínio próprio depois:** solicite o certificado em `us-east-1` (`aws acm request-certificate --region us-east-1 --domain-name app.exemplo.com --validation-method DNS`), crie o CNAME de validação (Route 53 ~US$ 0,50/zona/mês, ou o DNS que você já tem), preencha `domain_name` + `acm_certificate_arn` no `terraform.tfvars`, `terraform apply`, e crie o CNAME `app.exemplo.com -> cloudfront_domain`. Atualize `MONEYLOG_ALLOWED_ORIGINS` no SSM e rode o deploy do backend.

## 5. Deploy do frontend

Script: `scripts/deploy-frontend.sh` (idempotente, sem segredos).

```
export S3_BUCKET=$(terraform -chdir=infra/terraform output -raw frontend_bucket)
export CLOUDFRONT_DISTRIBUTION_ID=$(terraform -chdir=infra/terraform output -raw cloudfront_distribution_id)
scripts/deploy-frontend.sh --dry-run     # build + o que mudaria no S3; não envia nem invalida
scripts/deploy-frontend.sh               # build, sync, invalidação
```

O que ele faz, na ordem (e é o que você faria à mão):

1. `cd frontend && npm ci && npm run build`. Saída: `frontend/dist/moneylog/browser`.
2. `aws s3 sync ... --delete` de **JS, CSS e fontes com hash** com `Cache-Control: public,max-age=31536000,immutable`.
3. Sync dos demais arquivos sem hash (ícones, imagens) com `max-age=86400`.
4. **Por último**, `index.html`, `ngsw.json`, `ngsw-worker.js`, `sw-push.js` e `manifest.webmanifest` com `Cache-Control: no-cache` (é por eles que o PWA descobre versão nova; subi-los por último evita um `index.html` apontando para arquivo que ainda não chegou).
5. `aws cloudfront create-invalidation --paths "/*"`.

Como o que é servido atende a cada requisito:

- **S3 privado + OAC:** bucket com bloqueio de acesso público, política que só aceita a distribuição (`AWS:SourceArn`). Nada de website endpoint.
- **HTTPS grátis em `*.cloudfront.net`:** certificado padrão do CloudFront (a TLS mínima é imposta pelo CloudFront nesse caso; com domínio próprio o Terraform usa `TLSv1.2_2021`). `viewer_protocol_policy = redirect-to-https`.
- **Fallback de SPA (desvio do pedido "403/404 -> /index.html 200"):** usei uma **CloudFront Function** no comportamento do front (URL sem ponto vira `/index.html`), e **não** `custom_error_response`, porque essa regra vale para a distribuição inteira e transformaria um 404/403 da API (`/v1/*`) em `index.html` com status 200, escondendo erros do backend. Se você montar à mão no console, faça igual.
- **`/v1/*` no mesmo domínio:** comportamento ordenado que manda para a origem EC2 (porta 8080), cache **desligado**, métodos completos, cookies, cabeçalhos (inclui `Origin`) e query string repassados. Assim front e API compartilham o domínio: o cookie de refresh `SameSite=Strict` e a checagem CSRF funcionam, sem CORS.
- **Nada de `/v1` em cache:** CloudFront (`CachingDisabled`) e service worker (`ngsw-config.json` não tem `dataGroups` para a API).
- **Cabeçalhos de segurança:** HSTS (1 ano), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`. **CSP:** o `index.html` do Angular tem 2 scripts inline e 1 `<style>` inline, então uma CSP precisa dos hashes dos scripts. `scripts/deploy-frontend.sh --print-csp` imprime uma CSP pronta (ex.: `script-src 'self' 'sha256-...' 'sha256-...'`, `style-src 'self' 'unsafe-inline'`). Cole em `content_security_policy` no `terraform.tfvars`, `terraform apply` e **teste no navegador** (console sem violações, login, fotos das metas, instalação do PWA). **Não validei essa CSP em navegador:** é pendência. Os hashes só mudam se esses scripts inline mudarem.
- **Service worker/PWA:** `ngsw-worker.js`, `ngsw.json` e `index.html` sem cache; o convite de instalação e o aviso de nova versão já existem no app. Após cada deploy, a primeira abertura ainda usa a versão em cache e oferece "Atualizar".
- **Log de query string desligado:** a distribuição não tem `logging_config` (o termo de busca vai em `GET /v1/search?q=`). Não ligue o log padrão nem o log em tempo real sem tirar a query.

## 6. Deploy do backend

### 6.1 Parâmetros (SSM Parameter Store, Standard, grátis)

Um parâmetro por variável, nome = nome da variável, sob `/moneylog/prod/`. O `deploy.sh` da instância baixa todos para `/opt/moneylog/secrets` (um arquivo por variável, dono uid 10001, modo 400) e o Spring os lê pelo `SECRETS_DIR`/`configtree`. **Parâmetro vazio não existe no SSM:** simplesmente não crie o que quer deixar no padrão.

```
P=/moneylog/prod
put()  { aws ssm put-parameter --region $AWS_REGION --overwrite --type String       --name "$P/$1" --value "$2" >/dev/null; }
puts() { aws ssm put-parameter --region $AWS_REGION --overwrite --type SecureString --name "$P/$1" --value "$2" >/dev/null; }

put  DB_URL                   "jdbc:postgresql://postgres:5432/moneylog"
put  DB_USER                  "moneylog"                       # igual a db_username do Terraform
puts DB_PASSWORD              "$(openssl rand -base64 36 | tr -d '\n')"
puts JWT_SECRET               "$(openssl rand -base64 48 | tr -d '\n')"      # nunca o de dev
put  MONEYLOG_OWNER_EMAIL     "voce@exemplo.com"
puts MONEYLOG_OWNER_SETUP_CODE "$(openssl rand -hex 16)"       # >= 16 caracteres, vale 24 h (ADR-015)
put  MONEYLOG_ALLOWED_ORIGINS "$(terraform -chdir=infra/terraform output -raw app_url)"
put  MONEYLOG_TRUSTED_PROXIES "$(scripts/deploy-backend.sh --print-trusted-proxies)"
put  AI_PROVIDER              "none"                           # chaves de IA vazias: não crie AI_API_KEY
put  MONEYLOG_PUSH_ENABLED    "false"
put  MONEYLOG_BACKUP_ENABLED  "true"
put  BACKUP_STORAGE           "s3"
put  BACKUP_S3_REGION         "$AWS_REGION"
put  BACKUP_S3_BUCKET         "$(terraform -chdir=infra/terraform output -raw backups_bucket)"
```

Notas:

- **Não crie `MONEYLOG_OWNER_PASSWORD_HASH`.** Sem ele, o dono nasce sem senha e define a sua em `POST /v1/auth/setup-password` com o `MONEYLOG_OWNER_SETUP_CODE` (válido por 24 h; se expirar, reinicie o backend e confira o comportamento na ADR-015). Vale também `MONEYLOG_OWNER_SETUP_CODE_FILE`, mas com o `configtree` o nome do arquivo já é o da variável.
- **`MONEYLOG_TRUSTED_PROXIES` é obrigatório em `prod`** e deve ter os CIDRs do CloudFront (`CLOUDFRONT_ORIGIN_FACING`, lista oficial em `ip-ranges.amazonaws.com`; na minha consulta: 46 IPv4 + 35 IPv6, cerca de 1,5 KB, cabe no limite de 4 KB do Standard). Eles mudam: refaça o comando a cada trimestre e o `put` de novo. O SG já usa a lista gerenciada equivalente, que a AWS atualiza sozinha.
- **Cookie `Secure`:** já é fixo no perfil `prod` (`cookie-secure: true`); só funciona atrás de HTTPS (CloudFront).
- **`SPRING_PROFILES_ACTIVE=prod`:** definido no compose e na imagem.
- **Backup:** sem chave de acesso; a role da instância fornece as credenciais (IMDSv2). `BACKUP_ENCRYPTION_KEY`: veja a lacuna da seção 2 antes de definir. Se definir, use `openssl rand -base64 32`, e guarde uma cópia **fora** da AWS (gerenciador de senhas).
- **VAPID/push:** desligado. Para ligar depois: gere as chaves (`npx web-push generate-vapid-keys`), crie as três `MONEYLOG_PUSH_VAPID_*` e `MONEYLOG_PUSH_ENABLED=true` só com HTTPS real e o PWA instalado.
- **`unaccent`:** o usuário `moneylog` é o `POSTGRES_USER` do container, ou seja, superusuário e dono do banco; o Flyway (V6.01) cria a extensão sem ajuste.

### 6.2 Imagem e publicação

A imagem é construída **na sua máquina** (ou no CI) e publicada no ECR (centavos). Não construa na EC2: Maven + JVM não cabem em 1 GB junto com o Postgres.

```
export AWS_REGION=us-east-1
export ECR_REPOSITORY=$(terraform -chdir=infra/terraform output -raw ecr_repository)
export INSTANCE_ID=$(terraform -chdir=infra/terraform output -raw backend_instance_id)
# PLATFORM=linux/arm64 se instance_type for t4g.* (o padrão é linux/amd64)
scripts/deploy-backend.sh --dry-run     # mostra o plano; não constrói nem envia
scripts/deploy-backend.sh               # build -> push no ECR (tag = SHA do commit, imutável) -> SSM send-command
```

O que acontece na instância (`/opt/moneylog/deploy.sh <tag>`, instalado pelo `user_data`):

1. Baixa os parâmetros do SSM para `/opt/moneylog/secrets`.
2. Login no ECR, `docker pull` da tag.
3. Grava `IMAGE=...` em `/opt/moneylog/.env` e roda `docker compose up -d --remove-orphans`: o Postgres 17 (volume de dados em `/opt/moneylog/pgdata`, sem porta publicada) sobe saudável antes do backend (`depends_on: service_healthy`); o Flyway migra no boot.
4. Espera `GET http://127.0.0.1:8080/actuator/health` responder `UP` (até 3 min).
5. **Se não ficar UP, volta sozinho para a tag anterior** e sai com erro (o script local mostra o motivo). Tags: `/opt/moneylog/current-tag` e `previous-tag`.

Comandos do dia a dia:

| Ação | Comando |
|---|---|
| Atualizar (sem derrubar o Postgres; o backend reinicia em segundos) | `scripts/deploy-backend.sh` |
| Reaplicar uma tag que já está no ECR | `scripts/deploy-backend.sh --skip-build --tag <tag>` |
| **Rollback** para a tag anterior | `scripts/deploy-backend.sh --rollback` |
| Entrar na máquina (sem SSH) | `aws ssm start-session --target $INSTANCE_ID` |
| Estado e logs | `cd /opt/moneylog && sudo docker compose ps && sudo docker compose logs --tail 100 backend` |
| Logs persistentes | CloudWatch Logs, grupo `terraform output -raw log_group` (JSON ECS, sem segredos) |

> "Sem derrubar" é relativo: com um único nó, o backend fica indisponível durante o restart (segundos). Migração incompatível com a versão anterior **não** é revertida pelo rollback de imagem: restaure o backup (seção 8).
> O `deploy.yml` (GitHub Actions) continua chamando `/opt/moneylog/deploy.sh <tag>` com a mesma interface, mas constrói a imagem em runner x86 e foi escrito para o desenho com RDS. Para ARM, ajuste o workflow para `buildx --platform linux/arm64`.

### 6.3 Conferir

```
curl -s https://<app_url>/                                  # abre o app (index.html)
curl -si https://<app_url>/v3/api-docs | head -1             # 404
curl -si https://<app_url>/v1/accounts | head -1             # 401 sem token
```

Primeiro acesso: abra o app, informe o e-mail do dono e o código (`aws ssm get-parameter --with-decryption --name /moneylog/prod/MONEYLOG_OWNER_SETUP_CODE --query Parameter.Value --output text`) e defina a senha (12+ caracteres). Depois, apague ou troque o parâmetro do código.

## 7. Checklist de segurança antes de publicar

Marque cada item. **Bloqueio** = não publique dado real sem resolver.

- [ ] **BLOQUEIO: 2FA/TOTP não existe no app** (hoje o login é só e-mail e senha; ADR-003). Pendência registrada em `deploy-aws.md`. Sem ele, o login é a única barreira de um app financeiro na internet; use senha longa e única e rate limit (já existe) e **não** use dados reais até o TOTP existir.
- [ ] **BLOQUEIO (modo `cloudfront`; resolvido no modo `cloudflare`, seção 11): HTTPS na origem.** Hoje o trecho CloudFront -> EC2 é `http-only` na 8080: cookies, token e dados financeiros cruzam a rede da AWS/internet sem criptografia. Solução: domínio próprio (ex.: `origin.exemplo.com` apontando para o EIP), um proxy com certificado (por exemplo Caddy/Let's Encrypt no compose) na 443 e origem do CloudFront `https-only` com esse nome. O SG passaria a abrir a **443 no lugar da 8080** (a prefix list ocupa ~55 regras; duas portas estourariam a cota padrão de 60). **Não implementado.** O SG limitado ao CloudFront também não impede que outra distribuição CloudFront aponte para o seu IP; a API continua protegida só pelo JWT (como seria de qualquer forma na internet).
- [ ] **MFA no root** ativo; usuário administrador sem chaves de acesso de longa duração (SSO).
- [ ] **Orçamento e alertas de custo:** `budget_alert_email` confirmado (o e-mail de assinatura do SNS/Budgets pede confirmação). Ligue também os alertas de **créditos** e de Free Tier no console (Billing > Preferences).
- [ ] **HTTPS obrigatório:** CloudFront redireciona HTTP para HTTPS; `/v1/*` é `https-only`; HSTS ativo.
- [ ] **Log de query string desligado** no CloudFront (sem `logging_config`) e **sem ALB**. Confirme no console que o log padrão está desligado.
- [ ] **`unaccent`:** teste a busca global com acento (`aeiou` encontra `áéíóú`) depois do primeiro deploy.
- [ ] **`MONEYLOG_TRUSTED_PROXIES`** com os CIDRs do CloudFront; teste que 5 logins errados de um IP não bloqueiam outro.
- [ ] **Chaves de IA vazias:** `AI_PROVIDER=none`, sem `AI_API_KEY`. (`fake` é recusado em `prod`.)
- [ ] **VAPID/push:** desligado até haver HTTPS real; chaves privadas só no SSM (SecureString).
- [ ] **JWT_SECRET novo**, senha do dono definida pelo primeiro acesso, nenhum segredo no repositório (o `gitleaks` roda no CI).
- [ ] **Sem SSH:** SG sem porta 22; acesso só por Session Manager.
- [ ] **Backup testado:** restauração feita (seção 8) e chave de cifra guardada fora da AWS.
- [ ] **CSP** testada em navegador e aplicada (pendência da seção 5).
- [ ] **Swagger/`/v3/api-docs`** respondem 404; `/actuator/health` só expõe `UP`.

## 8. Zerar, começar vazio, restaurar e levar os dados locais

### 8.1 Começar vazio em produção

Banco novo = o primeiro `deploy-backend.sh`: o Flyway cria o schema e o `OwnerBootstrap` cria **só o dono** (`MONEYLOG_OWNER_EMAIL`) sem senha; ele escolhe a senha com o código de primeiro acesso. Não há dado de exemplo em `prod`.

### 8.2 ZERAR um ambiente existente (apaga tudo)

`scripts/reset-database.sh` roda **na instância**, como root, em terminal interativo. Nunca roda sozinho, não está em nenhum workflow e não tem modo silencioso.

```
# da sua máquina: instala o script na instância (uma vez)
B64=$(base64 < scripts/reset-database.sh | tr -d '\n')
aws ssm send-command --instance-ids $INSTANCE_ID --document-name AWS-RunShellScript \
  --parameters "commands=[\"echo $B64 | base64 -d > /opt/moneylog/reset-database.sh && chmod 700 /opt/moneylog/reset-database.sh\"]"

# entra na instância e roda
aws ssm start-session --target $INSTANCE_ID
sudo -i
RESET_ENV_NAME=prod /opt/moneylog/reset-database.sh      # exige digitar "prod" para confirmar
```

Ele checa antes de apagar (existe `MONEYLOG_OWNER_SETUP_CODE`, **não** existe `MONEYLOG_OWNER_PASSWORD_HASH`), faz **`pg_dump` de segurança** em `/opt/moneylog/safety-backups` (aborta se falhar), para o backend, recria o schema `public` vazio, religa (Flyway recria tudo; o dono volta sem senha) e espera o health. Só para `database_mode = "ec2"`; no RDS zere pelo `psql`/novo banco à mão.

### 8.3 Restauração do backup (teste obrigatório antes do go-live)

1. Liste: `aws s3 ls s3://$(terraform -chdir=infra/terraform output -raw backups_bucket)/moneylog/ --recursive`. Baixe o `.dump` (se terminar em `.dump.enc`, veja a lacuna da cifra na seção 2).
2. Para testar sem risco, **restaure numa base nova**, não na de produção:
   ```
   sudo docker compose -f /opt/moneylog/docker-compose.yml exec -T postgres createdb -U moneylog moneylog_restore
   sudo docker compose -f /opt/moneylog/docker-compose.yml exec -T postgres pg_restore -U moneylog -d moneylog_restore --no-owner --no-privileges --exit-on-error < arquivo.dump
   sudo docker compose -f /opt/moneylog/docker-compose.yml exec -T postgres psql -U moneylog -d moneylog_restore -c "select count(*) from accounts"
   ```
3. Confira saldos, razão (soma zero) e contagens. Depois `dropdb moneylog_restore`.
4. Recuperação de desastre pelo snapshot do EBS (DLM): crie um volume a partir do snapshot mais recente, anexe e monte, suba um Postgres 17 apontando para ele. Não é consistente a nível de aplicação (é uma cópia de disco); use o `pg_dump` como cópia principal.

### 8.4 Levar os dados do ambiente local para a produção

Os dados locais são pessoais: nunca os coloque no repositório, em ticket ou em docs.

1. Na sua máquina, gere o dump do Postgres local (`scripts/backup.sh`, com as `DB_*` do seu ambiente; formato custom).
2. Suba para o bucket privado de backups, num prefixo próprio, e apague depois: `aws s3 cp moneylog-....dump s3://<backups_bucket>/moneylog/import/local.dump`.
3. Na instância (Session Manager, root), com o **mesmo ou menor** conjunto de migrações da imagem implantada (o Flyway recusa um banco com migração mais nova que o código):
   ```
   cd /opt/moneylog
   aws s3 cp s3://<backups_bucket>/moneylog/import/local.dump /root/local.dump
   docker compose stop backend
   docker compose exec -T postgres psql -U moneylog -d moneylog -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE" -c 'CREATE SCHEMA public AUTHORIZATION "moneylog"'
   docker compose exec -T postgres pg_restore -U moneylog -d moneylog --no-owner --no-privileges --exit-on-error < /root/local.dump
   docker compose start backend
   shred -u /root/local.dump
   ```
4. O dono do dump já tem senha. O `MONEYLOG_OWNER_EMAIL` do SSM precisa ser o mesmo e-mail (o app atualiza o e-mail, mantendo o id, se diferir). Não é preciso código de primeiro acesso.
5. Apague o dump do S3 (`aws s3 rm`; o versionamento guarda a versão: apague também a versão, ou deixe o lifecycle expirá-la em 30 dias).

## 9. O que foi verificado e o que você precisa conferir

**Verificado nesta rodada (executado localmente):** `terraform fmt -check` e `validate` (imagem `hashicorp/terraform:1.9`, `init -backend=false`, nada de `plan`/`apply`); renderização do `user_data.sh.tftpl` nos dois modos + `bash -n`; `docker compose config` do compose gerado; `bash -n` e `shellcheck` (imagem `koalaman/shellcheck`) em `deploy-frontend.sh`, `deploy-backend.sh`, `reset-database.sh`; `--print-csp` (hashes calculados do `index.html` real do build); `--print-trusted-proxies` (consulta real a `ip-ranges.amazonaws.com`: 46 IPv4 + 35 IPv6 no serviço `CLOUDFRONT_ORIGIN_FACING`); `--dry-run` do `deploy-backend.sh`. O comportamento real do `aws s3 sync` com filtros, do SSM, do ECR, do CloudFront e do `docker compose` na instância **não foi exercitado** (sem conta, sem `aws` CLI na máquina).

**Fatos de preço e plano vieram de pesquisa repassada pelo orquestrador e dos preços de lista que conheço; não abri as páginas oficiais nesta rodada** (são dinâmicas). Confira todas antes de decidir:

| Assunto | Fonte oficial |
|---|---|
| Free Tier, créditos, plano Free x Pago, serviços Always Free | https://aws.amazon.com/free/ e https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier.html |
| EC2 (t3.micro, t4g.micro, por região) | https://aws.amazon.com/ec2/pricing/on-demand/ |
| IPv4 público (US$ 0,005/h) | https://aws.amazon.com/vpc/pricing/ (aba Public IPv4 Address) |
| EBS gp3 e snapshots | https://aws.amazon.com/ebs/pricing/ |
| RDS PostgreSQL db.t3.micro | https://aws.amazon.com/rds/postgresql/pricing/ |
| CloudFront (1 TB, 10 M req, invalidações) | https://aws.amazon.com/cloudfront/pricing/ |
| Parameter Store / Session Manager | https://aws.amazon.com/systems-manager/pricing/ |
| CloudWatch Logs | https://aws.amazon.com/cloudwatch/pricing/ |
| Route 53 | https://aws.amazon.com/route53/pricing/ |
| Lightsail | https://aws.amazon.com/lightsail/pricing/ |
| ALB e NAT Gateway (o que evitamos) | https://aws.amazon.com/elasticloadbalancing/pricing/ e https://aws.amazon.com/vpc/pricing/ |
| Faixas de IP do CloudFront | https://ip-ranges.amazonaws.com/ip-ranges.json |

Confira também no console: quais tipos de instância o plano Free libera; saldo e validade dos créditos (Billing > Credits); se o crédito cobre S3/ECR/CloudWatch; a cota de regras por Security Group (60) e o tamanho atual da prefix list do CloudFront (~55); se a versão `v2.29.7` do Compose e a tag `postgres:17` ainda existem.

## 10. Decisões do dono

1. **Domínio próprio?** Sem domínio: URL `*.cloudfront.net` (grátis), mas **sem HTTPS na origem** (item bloqueante da seção 7). Com domínio: ~US$ 12 a 15/ano + DNS.
2. **Região:** `us-east-1` é a mais barata; `sa-east-1` tem latência menor para o Brasil e custa mais (confira). Dados financeiros pessoais ficam na região escolhida.
3. **x86 ou ARM:** `t4g.micro` é ~20% mais barato; exige imagem arm64 (`PLATFORM=linux/arm64`). Num Mac Apple Silicon o build arm64 é nativo.
4. **EC2 (padrão) ou RDS:** RDS custa ~US$ 13 a 15/mês a mais por backup/patch gerenciados.
5. **Cifra do backup:** ligar `BACKUP_ENCRYPTION_KEY` agora (sem CLI de descriptografia) ou depois que ela existir.
6. **Prazo:** o plano Free acaba em até 6 meses; decidir migrar para o Pago para manter o app e os créditos restantes.

## 11. Cloudflare na frente (recomendado se o domínio é seu)

**Status: NADA FOI EXECUTADO** (nem na AWS nem na Cloudflare). Validado localmente: `terraform fmt/validate` (Docker `hashicorp/terraform:1.9`), `bash -n` e `shellcheck`, `docker compose config`, `caddy validate` e um teste funcional do Caddyfile em Docker com backend de mentira (cabeçalhos de cache, fallback de SPA, IP real, `/v1/*`). Os preços e a interface da Cloudflare/AWS mudam: confira nas telas.

> **BLOQUEIO que continua: 2FA/TOTP não existe no app** (seção 7). Colocar a Cloudflare na frente não substitui isso. Não use dado financeiro real até o TOTP existir.

### 11.1 Como fica

```
Navegador --HTTPS--> Cloudflare (proxy, WAF, cache só do que é estático) --HTTPS (Origin Certificate)--> EC2:443 (Caddy)
                                                                                   |-- /v1/* e /actuator/health -> backend:8080 (Spring)
                                                                                   |-- demais caminhos         -> /srv/app/current (front Angular)
                                                         Postgres 17 (EBS) e backend só na rede interna do compose
```

- **Modo `cloudflare` do Terraform** (`edge_mode = "cloudflare"`, exige `domain_name`): cria só EC2 (Amazon Linux 2023, `t3.micro`/`t4g.micro`), Elastic IP, volume EBS de dados + snapshot diário (DLM), bucket privado de **backup**, bucket privado de **artefatos do front** (zip do build), ECR, role com Session Manager + CloudWatch Logs + leitura dos artefatos + escrita no backup, Budgets, e dois Security Groups. **Não cria** S3 de site, CloudFront, OAC nem funções de CloudFront. O modo `cloudfront` continua funcionando (é o padrão da variável, para não mudar nada que já existia; o `terraform.tfvars.example` já vem com `cloudflare`).
- **Security Group:** a 443 aceita **somente** os CIDRs da Cloudflare; sem 22 e sem 8080 públicos (o backend só publica em `127.0.0.1`). A 80 só abre com `cloudflare_allow_http = true` (e só para a Cloudflare, para redirecionar). Acesso à máquina: Session Manager.
- **Lista de IPs:** o Terraform baixa `https://www.cloudflare.com/ips-v4` e `ips-v6` (data source `http`); se a resposta não for 200 ou vier inválida, usa `cloudflare_ipv4_fallback`/`cloudflare_ipv6_fallback`. Sem rede no `plan`: `cloudflare_fetch_ips = false`. Hoje são 15 CIDRs IPv4 + 7 IPv6.
- **Limite de regras por SG (cota padrão: 60 por SG):** uma regra que usa prefix list conta o `max_entries` dela, não os itens usados. Por isso o Terraform cria **duas prefix lists próprias** (`...-cloudflare-v4`, máx. 25, e `...-cloudflare-v6`, máx. 15 = 40 por porta) e separa a 443 e a 80 em **dois SGs** (40 + 40 num só estouraria 60). Se a Cloudflare passar de 25/15 CIDRs, o `plan` falha com mensagem clara (aumente `cf_v4_max`/`cf_v6_max` em `edge_cloudflare.tf` e confira a cota). As prefix lists atualizam no próximo `terraform apply`.
- **Caddy** (`infra/caddy/Caddyfile`, imagem `caddy:2`, só HTTP/1.1 e HTTP/2): usa `origin.pem`/`origin.key`; IP real do visitante via `CF-Connecting-IP` só quando a conexão vem de um CIDR da Cloudflare (`servers { trusted_proxies static ...; client_ip_headers CF-Connecting-IP }`) e repassa **um único** `X-Forwarded-For` limpo ao backend; HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`; CSP opcional (desligada por padrão; `content_security_policy` no Terraform); fallback de SPA **só** para caminhos sem extensão e que não existem como arquivo (arquivo com extensão ausente dá 404 real, e `/v1/*` nunca vira `index.html`); `Cache-Control: no-cache` para tudo que não tem hash (`index.html`, `ngsw.json`, `ngsw-worker.js`, `manifest.webmanifest`, rotas); `public, max-age=31536000, immutable` para `main-XXXXXXXX.js`, `styles-XXXXXXXX.css`, chunks e fontes com hash; `/v1/*` com `Cache-Control: no-store`; só o caminho exato `/actuator/health` é exposto do actuator; o log do Caddy remove query string, `Authorization` e `Cookie` (a busca vai em `GET /v1/search?q=`).
- **`MONEYLOG_TRUSTED_PROXIES` e `MONEYLOG_ALLOWED_ORIGINS`:** no modo `cloudflare` o `deploy.sh` da instância os grava sozinho (valores do Terraform têm prioridade sobre o SSM): `https://<domínio>` e `172.29.0.0/24` (a rede fixa do compose, de onde o Caddy fala com o backend) + os CIDRs da Cloudflare. **Não crie esses dois no SSM** neste modo. O backend lê o IP do `X-Forwarded-For` montado pelo Caddy.
- **Authenticated Origin Pulls (opcional):** `cloudflare_authenticated_origin_pulls = true` faz o Caddy exigir o certificado de cliente da Cloudflare (mTLS; CA público baixado de `developers.cloudflare.com`). **Ordem:** ative primeiro em SSL/TLS > Origin Server > Authenticated Origin Pulls na Cloudflare, depois o Terraform. Como a 443 já só aceita IPs da Cloudflare, isto defende de outra conta Cloudflare apontando para o seu IP (qualquer cliente Cloudflare sai dos mesmos IPs).

### 11.2 Custo mensal do modo `cloudflare` (us-east-1, a conferir no console)

| Item | Valor aproximado |
|---|---|
| EC2 `t3.micro` (`t4g.micro` ARM: ~US$ 6,10) | ~US$ 7,60 |
| IPv4 público / Elastic IP (cobrado desde 02/2024) | ~US$ 3,65 |
| EBS gp3: 12 GB do sistema + 10 GB de dados | ~US$ 1,76 |
| Snapshots diários (DLM, 7 retidos) | ~US$ 0,10 a 0,50 |
| S3 de backup + S3 de artefatos (30 dias) + ECR | ~US$ 0,20 a 0,50 |
| CloudWatch Logs (14 dias), SSM, Budgets, Session Manager | US$ 0 |
| Cloudflare Free (DNS, proxy, SSL, WAF gerenciado grátis, 1 regra de rate limit) | US$ 0 |
| **Total** | **~US$ 13 a 14/mês** (ARM: ~US$ 12) |

Sem CloudFront nem S3 de site na conta. Honestamente, **não é mais barato** que o modo `cloudfront` (que já era ~US$ 14, com CloudFront no Always Free): o ganho é **HTTPS de ponta a ponta**, WAF/rate limit/cache da Cloudflare, e a origem trancada para a Cloudflare. O domínio você já tem (sem custo extra de DNS). Créditos: as mesmas contas da seção 2 (~7 a 8 meses com US$ 100).

### 11.3 Riscos (leia antes de decidir)

- **A Cloudflare enxerga o tráfego em claro** (ela termina o TLS do visitante e abre outro para a origem): inclui senha no login, cookies e dados financeiros. É confiança num terceiro; a conta Cloudflare vira alvo: **ative 2FA na Cloudflare** e use senha única.
- **O IP de origem deve ficar escondido.** Não publique o Elastic IP (nem em DNS sem proxy, nem em subdomínios "cinzas" como `origin.`, nem no e-mail do domínio, nem no repositório). Mesmo assim a 443 só aceita IPs da Cloudflare. Não crie registros sem proxy (nuvem cinza) para essa máquina.
- **Rotacione o Origin Certificate** (vale 15 anos): ao suspeitar de vazamento da chave, ou a cada ~1 ano por higiene. Gere um novo, carregue no SSM (11.6), rode `scripts/deploy-backend.sh` (o `deploy.sh` rebaixa os arquivos e recarrega o Caddy) e revogue o antigo na Cloudflare.
- **Limites da Cloudflare Free:** corpo de requisição máx. **100 MB** (as fotos das metas têm limite bem menor), timeout de **100 s** por requisição (erro 524; o Caddy já corta a origem em 90 s), cache só de arquivos estáticos por extensão (a API nunca é cacheada por padrão, mas coloque as regras da 11.5), 1 regra de rate limiting. A Cloudflare pode mudar planos e limites: confira.
- **Queda da Cloudflare = app fora do ar** (ponto único a mais). Queda da origem = página de erro 52x da Cloudflare.
- Os IPs da Cloudflare mudam raramente: `terraform apply` atualiza o Security Group; para o Caddy e o backend, rode na instância `sudo /opt/moneylog/edge-refresh.sh`.

### 11.4 Ordem EXATA do primeiro deploy (modo `cloudflare`)

**A. AWS (você)**
1. Conta AWS nova; **MFA no root**; crie um usuário administrador (IAM Identity Center/SSO, `aws configure sso`). Não use o root no dia a dia.
2. Créditos e orçamento: em Billing, confirme os créditos; ligue os alertas de crédito/Free Tier. O Terraform cria o Budget (`budget_alert_email`; confirme o e-mail do SNS).
3. Bucket do estado do Terraform e `terraform.tfvars` (seção 3). Preencha: `edge_mode = "cloudflare"`, `domain_name = "app.seudominio.com"`, `region`, `instance_type`, `budget_alert_email`, `github_repo`.
4. `terraform init` / `terraform plan -out=tfplan` (leia tudo: sem CloudFront, sem S3 de site, sem RDS, sem NAT/ALB; 2 prefix lists e 1 SG de 443) / `terraform apply tfplan`. Anote `terraform output elastic_ip`, `artifacts_bucket`, `backups_bucket`, `backend_instance_id`, `ecr_repository`.
5. Espere o `user_data` terminar (EC2 > Monitor e solucionar problemas > Log do sistema; ou `cloud-init status` via Session Manager).
6. Carregue **os parâmetros do app** (seção 6.1), **menos** `MONEYLOG_ALLOWED_ORIGINS` e `MONEYLOG_TRUSTED_PROXIES` (neste modo o `deploy.sh` os define). `BACKUP_S3_BUCKET` = `backups_bucket`.

**B. Cloudflare (você)** — passos detalhados na 11.5. Resumo: criar o registro A (proxy ligado) para o `elastic_ip`; SSL/TLS **Full (strict)**; gerar o Origin Certificate.

**C. Certificado no SSM (você)** — 11.6. Sem ele o `deploy.sh` falha com mensagem clara e o Caddy não sobe.

**D. Deploys**
```
export AWS_REGION=us-east-1            # a região do Terraform
cd infra/terraform && terraform output deploy_commands && cd ../..     # comandos prontos, com os valores certos
scripts/deploy-backend.sh                                              # imagem -> ECR -> instância (sobe Postgres, backend e Caddy)
EDGE_MODE=cloudflare ARTIFACTS_BUCKET=... DOMAIN=app.seudominio.com INSTANCE_ID=... scripts/deploy-frontend.sh
```
O front: build, zip (`<sha>-<UTC>.zip`) para o bucket de artefatos (`--sse AES256`), `aws ssm send-command` para a EC2 baixar, conferir o SHA-256, extrair em `/srv/app/releases/<id>`, trocar o symlink `/srv/app/current` por `mv -T` (atômico), `caddy reload`, conferir `index.html` e, se falhar, **voltar para a versão anterior**; guarda as 3 últimas. Rollback manual: `EDGE_MODE=cloudflare INSTANCE_ID=... AWS_REGION=... scripts/deploy-frontend.sh --rollback`. `--dry-run` mostra sem enviar. O backend: `scripts/deploy-backend.sh` e `reset-database.sh` valem **iguais nos dois modos** (usam ECR, SSM e `/opt/moneylog`).

**E. Testar** (11.7).

### 11.5 Cloudflare, passo a passo (o nome das telas pode mudar um pouco)

1. **DNS:** adicione o registro **A**: Nome `app` (ou o subdomínio escolhido), IPv4 = `terraform output -raw elastic_ip`, **Proxy status: Proxied (nuvem laranja)**, TTL Auto. Não crie outros registros que apontem para esse IP.
2. **SSL/TLS > Overview:** modo **Full (strict)** (e **nunca** Flexible: mandaria tudo em HTTP até a origem).
3. **SSL/TLS > Edge Certificates:** **Always Use HTTPS** ligado; **Minimum TLS Version** 1.2; **HSTS** (Enable HSTS): `max-age` 6 meses para começar, Include subdomains só se todos os subdomínios do domínio forem HTTPS, Preload **desligado** no começo (é difícil de desfazer). O Caddy já envia HSTS de 1 ano.
4. **DNSSEC:** DNS > Settings > DNSSEC > Enable; copie o registro DS para o registrador do domínio (se o DNS do domínio já é da Cloudflare, o registrador pede só o DS).
5. **Origin Certificate:** SSL/TLS > **Origin Server** > Create Certificate > "Generate private key and CSR with Cloudflare"; tipo **RSA (2048)** ou **ECDSA**; hostnames: `app.seudominio.com` (e `*.seudominio.com` se quiser); validade **15 years**. **Copie o certificado (Origin Certificate) e a chave privada (Private Key) agora**: a chave só aparece uma vez. Cole em dois arquivos locais **fora do repositório** (ex.: `~/cf/origin.pem` e `~/cf/origin.key`, `chmod 600`). Passo seguinte (11.6) carrega no SSM e você apaga os arquivos locais.
6. **Caching > Cache Rules** (as regras de cache evitam que o HTML/SW/API fiquem presos na borda; a Cloudflare já não cacheia HTML nem JSON por padrão, mas deixe explícito). Crie, nesta ordem, uma regra **Bypass cache** com a expressão: `(http.request.uri.path starts_with "/v1/") or (http.request.uri.path eq "/ngsw.json") or (http.request.uri.path eq "/ngsw-worker.js") or (http.request.uri.path eq "/sw-push.js") or (http.request.uri.path eq "/manifest.webmanifest") or (http.request.uri.path eq "/index.html") or (http.request.uri.path eq "/")`. Arquivos com hash seguem o `Cache-Control: immutable` da origem. (Se algo já foi cacheado errado: Caching > Configuration > Purge Everything.)
7. **Speed > Optimization** (ou Content Optimization): **Rocket Loader desligado** (reescreve scripts e quebra o Angular), **Auto Minify desligado** em JS/CSS/HTML (se a opção ainda existir na sua conta; o build já é minificado), **Email Obfuscation desligado** (Scrape Shield; injeta script e HTML em respostas), e **Mirage/Polish/Rewrite** desligados se aparecerem. Deixe **Brotli** ligado.
8. **Security > WAF > Rate limiting rules** (o plano Free permite 1 regra, janela de 10 s): crie "login": expressão `(http.request.uri.path eq "/v1/auth/login")`, característica = IP, **5 requisições por 10 segundos**, ação **Block** por 10 s (a duração máxima do Free). É camada extra: o limite real do app (5 erros/15 min por IP) continua no backend.
9. **Security > WAF > Managed rules:** o **Cloudflare Managed Free Ruleset** vem ligado; confira. Em **Security > Settings**, deixe **Bot Fight Mode** ligado só se não atrapalhar o app (teste o login e a instalação do PWA). **Security Level** Medium.
10. **Network:** HTTP/3 e WebSockets podem ficar ligados (a origem só fala h1/h2). **Always Online** desligado (guardaria cópias de páginas).
11. **Authenticated Origin Pulls (opcional, depois que tudo funcionar):** ative em SSL/TLS > Origin Server > Authenticated Origin Pulls **e só então** `cloudflare_authenticated_origin_pulls = true` no Terraform. Como o `user_data` só roda na primeira partida, numa instância já criada faça à mão (Session Manager, root): `curl -fsSL https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem -o /opt/moneylog/edge/aop-ca.pem`; grave em `/opt/moneylog/aop.caddy` o bloco `client_auth { mode require_and_verify; trust_pool file /etc/caddy/aop-ca.pem }` (uma instrução por linha); acrescente ao serviço `caddy` do compose o volume `/opt/moneylog/edge/aop-ca.pem:/etc/caddy/aop-ca.pem:ro`; `docker compose up -d caddy`. Se algo der errado (erro 525/526), esvazie o `aop.caddy` e recrie o `caddy`. Como a 443 já só aceita IPs da Cloudflare, o Security Group cobre a maior parte do risco; isto é endurecimento extra.

### 11.6 Carregar o Origin Certificate no SSM (você, na sua máquina)

O certificado e a chave **nunca** passam pelo Terraform nem pelo estado. São `SecureString` (limite de 4 KB do Standard: cabe).

```
export AWS_REGION=us-east-1
P=/moneylog/prod/edge        # = ssm_prefix + /edge
aws ssm put-parameter --region $AWS_REGION --overwrite --type SecureString --name "$P/origin-pem" --value file://$HOME/cf/origin.pem
aws ssm put-parameter --region $AWS_REGION --overwrite --type SecureString --name "$P/origin-key" --value file://$HOME/cf/origin.key
shred -u $HOME/cf/origin.key $HOME/cf/origin.pem 2>/dev/null || rm -P $HOME/cf/origin.key $HOME/cf/origin.pem   # apaga as cópias locais
```

Guarde uma cópia da chave só no seu gerenciador de senhas (a Cloudflare não mostra de novo; se perder, gere outro certificado). O `deploy.sh` da instância baixa os dois para `/opt/moneylog/certs/origin.pem` e `origin.key` com permissão **600** (dono root), valida o cabeçalho PEM e recarrega o Caddy. Os nomes dos parâmetros também saem em `terraform output cloudflare_origin_cert_parameters`.

### 11.7 Como testar

```
D=app.seudominio.com
dig +short $D                                   # IPs da Cloudflare (NUNCA o seu Elastic IP)
curl -sI http://$D/ | head -3                   # 301/308 para https (Always Use HTTPS)
curl -si https://$D/ | head -15                 # 200; strict-transport-security, x-content-type-options, cache-control: no-cache
curl -si https://$D/actuator/health             # 200 {"status":"UP"}
curl -si https://$D/v1/accounts | head -5       # 401 sem token; cache-control: no-store
curl -si https://$D/v3/api-docs | head -1       # 404 ou index.html (SPA): nunca o swagger
curl -sI https://$D/ngsw.json | grep -i cache-control      # no-cache
curl -sI https://$D/main-XXXXXXXX.js | grep -i cache-control   # public, max-age=31536000, immutable (use o nome real do build)
curl -sI https://$D/nao-existe.js | head -1     # 404 (não vira index.html)
curl -sI https://$D/contas | head -1            # 200 (fallback da SPA)
curl -sk --connect-timeout 5 https://ELASTIC_IP/ ; echo $?   # tem que FALHAR (timeout): a origem só fala com a Cloudflare
```
Na instância: `cd /opt/moneylog && sudo docker compose ps` (postgres, backend, caddy). Rate limit por IP: 5 logins errados seguidos de um IP não podem bloquear outro; o IP nos logs do backend deve ser o seu, não o da Cloudflare.

### 11.8 Atualizar sem Terraform: CIDRs da Cloudflare

`terraform apply` (com `cloudflare_fetch_ips = true`) atualiza as prefix lists. Na instância: `sudo /opt/moneylog/edge-refresh.sh` (regrava os CIDRs do Caddy e do backend e recria o `caddy`).

### 11.9 CAMINHO MANUAL pelo console EC2 (sem Terraform)

Use só para um primeiro teste. **O Terraform continua sendo o caminho recomendado e repetível** (tudo abaixo, ele faz sozinho, e os erros de clique não se repetem). Convenções: região `us-east-1`; domínio `app.seudominio.com`; seu terminal local tem o `aws` configurado com SSO.

**Antes do console (na sua máquina)** — buckets e ECR (nomes de bucket são globais: troque `SEU-SUFIXO`):
```
export AWS_REGION=us-east-1 SUF=SEU-SUFIXO
for b in moneylog-backups-$SUF moneylog-artifacts-$SUF; do
  aws s3api create-bucket --bucket $b --region $AWS_REGION
  aws s3api put-public-access-block --bucket $b --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
done
aws s3api put-bucket-versioning --bucket moneylog-backups-$SUF --versioning-configuration Status=Enabled
aws ecr create-repository --repository-name moneylog-backend --image-tag-mutability IMMUTABLE --image-scanning-configuration scanOnPush=true --region $AWS_REGION
```
(o S3 já cifra com SSE-S3 por padrão; no console do bucket de backup, crie uma regra de ciclo de vida que expire versões antigas após 30 dias; no bucket de artefatos, expire `frontend/` após 30 dias).

**Perfil de instância do IAM** (IAM > Funções > Criar função > Serviço da AWS > EC2): anexe `AmazonSSMManagedInstanceCore` e crie uma política em linha mínima (troque `CONTA` e `SUF`):
```
{ "Version": "2012-10-17", "Statement": [
  { "Effect": "Allow", "Action": ["ssm:GetParametersByPath","ssm:GetParameters","ssm:GetParameter"],
    "Resource": "arn:aws:ssm:us-east-1:CONTA:parameter/moneylog/prod*" },
  { "Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*" },
  { "Effect": "Allow", "Action": ["ecr:BatchGetImage","ecr:GetDownloadUrlForLayer","ecr:BatchCheckLayerAvailability"],
    "Resource": "arn:aws:ecr:us-east-1:CONTA:repository/moneylog-backend" },
  { "Effect": "Allow", "Action": ["s3:PutObject","s3:GetObject","s3:DeleteObject"], "Resource": "arn:aws:s3:::moneylog-backups-SUF/moneylog/*" },
  { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::moneylog-backups-SUF" },
  { "Effect": "Allow", "Action": "s3:GetObject", "Resource": ["arn:aws:s3:::moneylog-artifacts-SUF/frontend/*","arn:aws:s3:::moneylog-artifacts-SUF/config/*"] },
  { "Effect": "Allow", "Action": ["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"], "Resource": "arn:aws:logs:us-east-1:CONTA:log-group:/moneylog/prod/backend*" }
] }
```
Nome sugerido: `moneylog-prod-backend`. (O SSM/Session Manager precisa só do `AmazonSSMManagedInstanceCore`; o grupo de logs `/moneylog/prod/backend` deve existir: `aws logs create-log-group --log-group-name /moneylog/prod/backend`.)

**Grupo de segurança** (EC2 > Grupos de segurança > Criar): nome `moneylog-prod-edge`, VPC padrão, **sem nenhuma regra de entrada** (nem SSH, nem HTTP), saída padrão. Depois, na sua máquina, libere a 443 só para a Cloudflare:
```
SG=sg-xxxxxxxx                              # id do grupo criado
for c in $(curl -fsS https://www.cloudflare.com/ips-v4); do
  aws ec2 authorize-security-group-ingress --region $AWS_REGION --group-id $SG --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=$c,Description=Cloudflare}]"
done
for c in $(curl -fsS https://www.cloudflare.com/ips-v6); do
  aws ec2 authorize-security-group-ingress --region $AWS_REGION --group-id $SG --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,Ipv6Ranges=[{CidrIpv6=$c,Description=Cloudflare}]"
done
```
**Atenção ao limite:** cada CIDR é uma regra (hoje 15 + 7 = 22; a cota padrão é 60 por grupo, para entrada IPv4 e IPv6 somadas). Não ponha a 80 no mesmo grupo (44 ainda cabe, mas a lista da Cloudflare cresce). Se um dia estourar, use uma lista de prefixos gerenciada (VPC > Listas de prefixos gerenciadas) com `max_entries` ≥ nº de CIDRs, como o Terraform faz. A lista muda raramente: reconfira de tempos em tempos.

**Tela "Executar instância"** (EC2 > Instâncias > Executar instâncias):

| Seção da tela | Escolha | Por quê |
|---|---|---|
| Nome e tags | `moneylog-prod-backend` | |
| Imagens de aplicação e de sistema operacional | **Amazon Linux 2023 AMI**, arquitetura **64 bits (x86)** | o que o guia usa |
| Tipo de instância | **t3.micro** | 2 vCPU/1 GB |
| Par de chaves (login) | **Prosseguir sem um par de chaves** | sem SSH: acesso por Session Manager |
| Configurações de rede > Editar | VPC padrão; **Selecionar grupo de segurança existente** = `moneylog-prod-edge`; Atribuir IP público automaticamente: pode deixar (o Elastic IP substitui depois) | |
| Configurar armazenamento | Volume raiz **20 GiB gp3, Criptografado = Sim** (chave padrão `aws/ebs`), "Excluir ao encerrar" = Sim. **Adicionar novo volume**: **10 GiB gp3**, dispositivo `/dev/sdf`, **Criptografado = Sim**, **Excluir ao encerrar = Não** | dados do Postgres sobrevivem à instância |
| Detalhes avançados > **Perfil de instância do IAM** | `moneylog-prod-backend` | |
| Detalhes avançados > **Proteção contra encerramento** | **Habilitar** | evita apagar por engano (para encerrar, desligue antes) |
| Detalhes avançados > **Especificação de crédito** | **Padrão** (não "Ilimitado") | no t3 o padrão do console pode vir ilimitado: CPU acima da base passaria a gerar cobrança extra surpresa; com Padrão o app só fica mais lento |
| Detalhes avançados > Monitoramento detalhado do CloudWatch | **Desabilitado** | tem custo |
| Detalhes avançados > Versão dos metadados | **V2 somente (token obrigatório)** | IMDSv2 |
| Detalhes avançados > Limite de saltos da resposta de metadados | **2** | o container precisa alcançar o IMDS |
| Detalhes avançados > Dados do usuário | vazio | os comandos abaixo fazem a preparação à mão |

**O que o console vai sugerir e você NÃO deve aceitar por padrão:**
- "Permitir tráfego SSH de **Qualquer lugar** / Meu IP" (a 22 não abre nunca) e "Permitir tráfego HTTPS/HTTP da Internet" (a 443 e a 80 abertas ao mundo; só a Cloudflare entra). Por isso use o grupo existente e não o assistente "Criar grupo de segurança".
- Criar/escolher um **par de chaves** (não há SSH).
- Volume raiz de 8 GiB, sem criptografia, e volume de dados com "Excluir ao encerrar = Sim".
- **Crédito ilimitado** no t3; **monitoramento detalhado**; **instâncias Spot**; "Habilitar proteção contra encerramento" desligada.
- Banners de "Free Tier", "Amazon Q", "AWS Backup/DLM automático", "Rede estendida", **ENA Express**, "Reserva de capacidade": ignore.
- Um **Application/Network Load Balancer** ou **NAT Gateway** sugerido por assistentes (~US$ 16 e ~US$ 32 por mês).

Depois de Executar: **Elastic IP** (EC2 > IPs elásticos > Alocar > Associar à instância; é ele o IP do registro A; anote e **não publique**). Opcional: EC2 > Gerenciador do ciclo de vida de dados (DLM) com um snapshot diário do volume de 10 GiB (tag no volume), 7 retidos.

**Comandos pós-lançamento** (EC2 > selecione a instância > **Conectar** > **Gerenciador de sessões**; aguarde a instância aparecer no SSM; depois `sudo -i`). Substitua o que está em MAIÚSCULAS.

```
# 1. Confirme o disco de dados (o de 10G, SEM partições e SEM sistema de arquivos). Só avance se tiver certeza do nome.
lsblk -f
DEV=/dev/nvme1n1
# 2. Formata (CUIDADO: apaga o disco) e monta em /var/lib/moneylog/pgdata por UUID
mkfs.xfs -L moneylogdata "$DEV"
mkdir -p /var/lib/moneylog/pgdata
UUID=$(blkid -s UUID -o value "$DEV")
echo "UUID=$UUID /var/lib/moneylog/pgdata xfs defaults,nofail 0 2" >> /etc/fstab
systemctl daemon-reload && mount -a && findmnt /var/lib/moneylog/pgdata
chown 999:999 /var/lib/moneylog/pgdata

# 3. Swap de 1 GB (1 GB de RAM roda Spring + Postgres)
dd if=/dev/zero of=/swapfile bs=1M count=1024 && chmod 600 /swapfile && mkswap /swapfile && echo "/swapfile none swap sw 0 0" >> /etc/fstab && swapon -a

# 4. Docker e plugin Compose (versão fixa, SHA-256 conferido)
dnf install -y docker unzip
systemctl enable --now docker
usermod -aG docker ssm-user                  # o usuário da sessão (vale na próxima sessão); root já pode usar
COMPOSE_VERSION=v2.29.7; CARCH=x86_64        # aarch64 se a instância for t4g
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/docker-compose-linux-$CARCH" -o /tmp/docker-compose
curl -fsSL "https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/docker-compose-linux-$CARCH.sha256" -o /tmp/docker-compose.sha256
(cd /tmp && echo "$(cut -d' ' -f1 docker-compose.sha256)  docker-compose" | sha256sum -c -)   # tem que dizer: OK
install -m 0755 /tmp/docker-compose /usr/local/lib/docker/cli-plugins/docker-compose && rm -f /tmp/docker-compose*
docker compose version

# 5. Pastas
mkdir -p /opt/moneylog/{certs,edge,backups,secrets} /srv/app/releases
chmod 700 /opt/moneylog/certs
chown 10001:10001 /opt/moneylog/backups
export AWS_REGION=us-east-1 SUF=SEU-SUFIXO P=/moneylog/prod DOMAIN=app.seudominio.com

# 6. Origin Certificate do SSM -> /opt/moneylog/certs (600, root)
umask 077
aws ssm get-parameter --region $AWS_REGION --with-decryption --name $P/edge/origin-pem --query Parameter.Value --output text > /opt/moneylog/certs/origin.pem
aws ssm get-parameter --region $AWS_REGION --with-decryption --name $P/edge/origin-key --query Parameter.Value --output text > /opt/moneylog/certs/origin.key
chmod 600 /opt/moneylog/certs/*; ls -l /opt/moneylog/certs; head -1 /opt/moneylog/certs/origin.pem
```
**Na sua máquina**, envie o compose, o Caddyfile e o script do front para o bucket de artefatos, e construa/publicue a imagem do backend:
```
aws s3 cp infra/caddy/Caddyfile            s3://moneylog-artifacts-$SUF/config/Caddyfile
aws s3 cp infra/caddy/docker-compose.manual.yml s3://moneylog-artifacts-$SUF/config/docker-compose.yml
aws s3 cp infra/caddy/deploy-frontend.remote.sh s3://moneylog-artifacts-$SUF/config/deploy-frontend.sh
ECR=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$AWS_REGION.amazonaws.com
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR
TAG=$(git rev-parse --short=12 HEAD); docker buildx build --platform linux/amd64 -t $ECR/moneylog-backend:$TAG --push backend
```
**De volta na instância (Session Manager, `sudo -i`):**
```
# 7. Compose, Caddyfile e script do front (puxados do bucket de artefatos)
cd /opt/moneylog
aws s3 cp s3://moneylog-artifacts-$SUF/config/Caddyfile Caddyfile
aws s3 cp s3://moneylog-artifacts-$SUF/config/docker-compose.yml docker-compose.yml
aws s3 cp s3://moneylog-artifacts-$SUF/config/deploy-frontend.sh deploy-frontend.sh && chmod 755 deploy-frontend.sh
echo "# Authenticated Origin Pulls desligado" > aop.caddy
echo "# CSP desligada" > csp.caddy
printf 'REGION=%s\nBUCKET=%s\nDOMAIN=%s\n' "$AWS_REGION" "moneylog-artifacts-$SUF" "$DOMAIN" > edge/front.env

# 8. CIDRs da Cloudflare (Caddy e backend) e origem permitida
ALL=$( (curl -fsS https://www.cloudflare.com/ips-v4; echo; curl -fsS https://www.cloudflare.com/ips-v6) | tr -d '\r' | grep -E '^[0-9a-fA-F:.]+/[0-9]+$')
printf 'CF_PROXIES=%s\n' "$(echo "$ALL" | paste -sd' ' -)" > edge/caddy.env
CIDRS=$(echo "$ALL" | paste -sd, -)

# 9. Parâmetros do app (SSM) -> /opt/moneylog/secrets, um arquivo por variável (como o deploy.sh do Terraform faz)
rm -f secrets/*
aws ssm get-parameters-by-path --region $AWS_REGION --path $P --with-decryption --query 'Parameters[].[Name,Value]' --output text |
  while IFS=$'\t' read -r n v; do printf '%s' "$v" > "secrets/$(basename "$n")"; done
printf '%s' "https://$DOMAIN" > secrets/MONEYLOG_ALLOWED_ORIGINS
printf '%s' "172.29.0.0/24,$CIDRS" > secrets/MONEYLOG_TRUSTED_PROXIES
chown -R 10001:10001 secrets && chmod 500 secrets && chmod 400 secrets/*

# 10. Variáveis do compose, login no ECR e subida
cat > .env <<EOF2
IMAGE=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$AWS_REGION.amazonaws.com/moneylog-backend:TAG_DO_PASSO_ANTERIOR
DOMAIN=$DOMAIN
DB_NAME=moneylog
DB_USER=$(cat secrets/DB_USER)
AWS_REGION=$AWS_REGION
LOG_GROUP=/moneylog/prod/backend
EOF2
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin "$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$AWS_REGION.amazonaws.com"
docker compose pull && docker compose up -d
docker compose ps

# 11. Conferir (o backend leva ~10 a 40 s para ficar UP)
curl -fsS http://127.0.0.1:8080/actuator/health
curl -skI --resolve $DOMAIN:443:127.0.0.1 https://$DOMAIN/actuator/health | head -12
```
Falta publicar o front: da sua máquina, `EDGE_MODE=cloudflare ARTIFACTS_BUCKET=moneylog-artifacts-$SUF DOMAIN=app.seudominio.com INSTANCE_ID=i-... AWS_REGION=us-east-1 scripts/deploy-frontend.sh`. Depois, o registro A e o resto na Cloudflare (11.5) e os testes (11.7). No caminho manual, **o `docker-compose.manual.yml` usa `/var/lib/moneylog/pgdata`** (o Terraform usa `/opt/moneylog/pgdata`); `scripts/deploy-backend.sh` e `reset-database.sh` esperam o `/opt/moneylog/deploy.sh` do Terraform, então no caminho manual atualize o backend repetindo os passos 9 e 10 com a nova `IMAGE`, e rode `reset-database.sh` apontando `COMPOSE_DIR=/opt/moneylog` (ele só usa o compose e `secrets/`). **Não exercitado:** nenhum destes comandos foi executado numa instância real (sem conta); revise cada um antes de rodar.
