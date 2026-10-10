# Guia: publicar o moneylog na AWS pelo menor custo possível

**Status: NADA FOI EXECUTADO na AWS.** Tudo aqui foi escrito e validado localmente (`terraform fmt/validate`, `bash -n`, `shellcheck`, `docker compose config`), sem conta e sem credenciais. Os comandos são os que **você** roda. Este guia **complementa** `deploy-aws.md` (roteiro original, com RDS) e a ADR-005; onde houver conflito, vale este guia (decisão: EC2 sem RDS como padrão).

## 0. Resumo honesto

- **Grátis de verdade, para sempre, só o que é "Always Free"**: CloudFront (1 TB de saída e 10 milhões de requisições por mês), Systems Manager (Parameter Store Standard e Session Manager), CloudWatch Logs (até 5 GB de ingestão), DLM, AWS Budgets (2 primeiros orçamentos). O front inteiro cabe aí.
- **Contas novas (depois de julho/2025) não têm os "12 meses grátis" de EC2/RDS/S3.** Recebem créditos (US$ 100 + até US$ 100 por tarefas de onboarding). O backend e o banco **consomem crédito**, e depois **cobram**.
- **Custo zero absoluto não é possível** para Spring Boot + Postgres (seção 2, arquitetura D).
- **Recomendação: arquitetura A** (S3 + CloudFront + 1 EC2 com Docker Compose rodando backend e Postgres 17, sem RDS, sem ALB): **~US$ 12 a 14 por mês**, ou seja, **~7 a 8 meses com os US$ 100** e **~14 a 16 meses com US$ 200**.
- **Bloqueios antes de colocar dado real** (seção 7): 2FA/TOTP não existe no app, e o trecho CloudFront -> EC2 trafega em HTTP (precisa de HTTPS na origem, que exige domínio próprio).

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
- [ ] **BLOQUEIO (recomendado): HTTPS na origem.** Hoje o trecho CloudFront -> EC2 é `http-only` na 8080: cookies, token e dados financeiros cruzam a rede da AWS/internet sem criptografia. Solução: domínio próprio (ex.: `origin.exemplo.com` apontando para o EIP), um proxy com certificado (por exemplo Caddy/Let's Encrypt no compose) na 443 e origem do CloudFront `https-only` com esse nome. O SG passaria a abrir a **443 no lugar da 8080** (a prefix list ocupa ~55 regras; duas portas estourariam a cota padrão de 60). **Não implementado.** O SG limitado ao CloudFront também não impede que outra distribuição CloudFront aponte para o seu IP; a API continua protegida só pelo JWT (como seria de qualquer forma na internet).
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
