# Roteiro de deploy na AWS

> **Nota (2026-10-10): o caminho mais barato e o padrão agora é `deploy-gratis-aws.md`** (EC2 com Postgres no Docker Compose, sem RDS, URL `*.cloudfront.net` opcional, scripts `scripts/deploy-frontend.sh`, `scripts/deploy-backend.sh`, `scripts/reset-database.sh`). Este roteiro continua válido para `database_mode = "rds"`; os passos 7 (papel dono no RDS) e a tabela de parâmetros com `DB_URL` do RDS só se aplicam a esse modo. No modo `ec2`, `DB_URL=jdbc:postgresql://postgres:5432/moneylog` e `DB_PASSWORD` é um valor gerado por você no SSM. Novos parâmetros do Terraform: `database_mode`, `domain_name`/`acm_certificate_arn` agora opcionais, `content_security_policy`, `data_volume_size_gb`.

**Status: NADA FOI EXECUTADO.** Este roteiro, o Terraform (`infra/terraform/`) e os workflows (`.github/workflows/`) foram escritos e validados localmente (`terraform fmt/validate`, `actionlint`), sem credenciais e sem tocar na AWS. Decisões e custo: `docs/adrs/ADR-005-topologia-aws-e-banco.md`. Cada passo abaixo é **seu**; os comandos são os que **você** executa.

## Pré-requisitos que bloqueiam o go-live

- [ ] **TOTP/2FA implementado antes do deploy** (hoje o login é só e-mail e senha; ADR-003). Não publique na internet sem ele.
- [ ] **HTTPS real** (certificado ACM válido no domínio). O cookie de refresh é `Secure`; sem HTTPS o login não funciona.
- [ ] Revisão de segurança (T178) e regressão final (T179) concluídas.

## Passo a passo

1. **Conta AWS e orçamento.** Crie/escolha a conta, ative MFA no root, crie um usuário administrador para executar o Terraform. Região padrão `sa-east-1`.
2. **Domínio e certificado.** Registre/aponte o domínio. Em `us-east-1`, solicite o certificado ACM e valide por DNS: `aws acm request-certificate --region us-east-1 --domain-name app.exemplo.com --validation-method DNS`. Guarde o ARN.
3. **Bucket e tabela do estado do Terraform** (uma vez, à mão ou por console): bucket S3 privado e versionado para o `tfstate`.
4. **Variáveis.** `cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars` e preencha domínio, ARN do ACM, e-mail do orçamento e `dono/repositorio` do GitHub.
5. **Terraform (você executa):**
   ```
   cd infra/terraform
   terraform init -backend-config="bucket=SEU-BUCKET-TFSTATE" -backend-config="key=moneylog/prod.tfstate" -backend-config="region=sa-east-1"
   terraform plan -out=tfplan      # leia o plano inteiro
   terraform apply tfplan          # cria EC2, RDS, CloudFront, S3, ECR, Budgets, OIDC
   ```
   Anote as saídas (`terraform output`).
6. **DNS.** Crie o CNAME/ALIAS do domínio para `cloudfront_domain`.
7. **Banco: papel dono e `unaccent`.** O RDS criou o banco com o usuário mestre (`moneylog`) como dono. Confirme: `SELECT datdba::regrole FROM pg_database WHERE datname = 'moneylog';` deve ser o usuário do app. O Flyway executa `CREATE EXTENSION unaccent` (V6.01): se o usuário do app **não** for o dono do banco, a migração falha. Teste antes: `CREATE EXTENSION IF NOT EXISTS unaccent;` pelo Session Manager.
8. **Parâmetros SSM (SecureString para segredos).** Um parâmetro por variável, nome = nome da variável, sob `/moneylog/prod/`. Veja a tabela abaixo. A senha do banco está no Secrets Manager (`terraform output database_secret_arn`): copie para `DB_PASSWORD`.
   ```
   aws ssm put-parameter --region sa-east-1 --type SecureString --name /moneylog/prod/JWT_SECRET --value "$(openssl rand -base64 48)"
   ```
9. **Primeiro deploy.** No GitHub: crie o Environment `production` com **revisores obrigatórios**; cadastre as *variables* (não segredos) `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN` (saída `github_deploy_role_arn`), `FRONTEND_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`, `BACKEND_INSTANCE_ID`. Dispare *Actions > deploy > Run workflow* e aprove. Para depurar: `aws ssm start-session --target <instance-id>` (sem SSH).
10. **Validação.** `curl -s https://app.exemplo.com/v1/...` (login), `https://app.exemplo.com/` abre o app, `/v3/api-docs` responde 404.
11. **Restauração de teste do backup** (antes do go-live): rode um backup, restaure numa base `moneylog_restore` e confira os saldos (`docs/operacao/backup.md`).
12. **Rollback.** O deploy usa tag imutável por commit no ECR. Para voltar: `aws ssm send-command --instance-ids <id> --document-name AWS-RunShellScript --parameters 'commands=["/opt/moneylog/deploy.sh <tag-anterior>"]'` (a tag atual está em `/opt/moneylog/current-tag`). Se a migração for incompatível, restaure o backup anterior (passo 11). Front: reenvie o build anterior e invalide o cache.

## Parâmetros SSM (inventário `.env.example` <-> SSM)

| Variável | Tipo SSM | Observação |
|---|---|---|
| `DB_URL` | String | `jdbc:postgresql://<database_endpoint>:5432/moneylog` |
| `DB_USER` | String | `moneylog` |
| `DB_PASSWORD` | SecureString | do Secrets Manager do RDS |
| `JWT_SECRET` | SecureString | >= 32 bytes aleatórios; **trocar o de dev** |
| `MONEYLOG_OWNER_EMAIL` | String | |
| `MONEYLOG_OWNER_PASSWORD_HASH` | SecureString | BCrypt; gere localmente, nunca a senha em claro |
| `MONEYLOG_ALLOWED_ORIGINS` | String | só `https://app.exemplo.com` |
| `MONEYLOG_TRUSTED_PROXIES` | String | **obrigatório em `prod`**: CIDRs do CloudFront (`ip-ranges.amazonaws.com`, `CLOUDFRONT_ORIGIN_FACING`) |
| `AI_PROVIDER`, `AI_MODEL` | String | `none` por padrão |
| `AI_API_KEY` | SecureString | só se IA ligada; só no servidor |
| `MONEYLOG_PUSH_ENABLED`, `MONEYLOG_PUSH_VAPID_SUBJECT` | String | push desligado por padrão |
| `MONEYLOG_PUSH_VAPID_PUBLIC`, `MONEYLOG_PUSH_VAPID_PRIVATE` | String / SecureString | `npx web-push generate-vapid-keys` |
| `MONEYLOG_BACKUP_ENABLED`, `BACKUP_STORAGE`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET` | String | `true`, `s3`, região e `backups_bucket`; sem chave: a role fornece |
| `BACKUP_ENCRYPTION_KEY` | SecureString | guarde uma cópia FORA da AWS |

## Checklist de go-live

- [ ] **TOTP/2FA** ativo (pré-requisito acima).
- [ ] **HTTPS real** validado (certificado, redirecionamento, HSTS pelo cabeçalho de segurança do CloudFront).
- [ ] `JWT_SECRET` novo (>= 32 bytes, nunca o de dev) e **senha do dono** definida (hash BCrypt).
- [ ] **`MONEYLOG_TRUSTED_PROXIES`** com os CIDRs do CloudFront (o app não sobe vazio em `prod`); testar que 5 logins errados de um IP não bloqueiam outro.
- [ ] **Extensão `unaccent`** criada no RDS por um papel **dono do banco**; busca global testada com acento.
- [ ] **Log de query string desligado**: CloudFront sem *standard logging*, e, se houver ALB, access logs desligados (o termo de busca vai em `GET /v1/search?q=`). Conferir também que nenhum WAF/log de terceiros grava a URL completa.
- [ ] **Variáveis de IA** no servidor (`AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`) apenas se ligar a IA; senão `AI_PROVIDER=none`. `fake` é recusado em `prod`.
- [ ] **VAPID** gerado e as três variáveis definidas, `MONEYLOG_PUSH_ENABLED=true` só depois de HTTPS real e de testar a assinatura.
- [ ] **Orçamento (AWS Budgets)** criado e e-mail confirmado.
- [ ] **Backup** ligado, com chave de cifra guardada fora da AWS, e **restauração de teste** feita.
- [ ] **PWA validada no iPhone** (instalar pela tela de início, login, push se ligado).
- [ ] Swagger/`v3/api-docs` respondem 404; `/actuator/health` responde apenas `UP`.
- [ ] Reavaliar os CIDRs do CloudFront e os alertas de custo no mês seguinte.

## O que **não** foi executado/exercitado nesta etapa

`terraform plan/apply`, qualquer chamada à AWS, o workflow `deploy.yml`, o `deploy.sh` na EC2, o S3 e o IMDS reais (apenas fakes locais), o certificado, o DNS, o push real e o provedor de IA real.
