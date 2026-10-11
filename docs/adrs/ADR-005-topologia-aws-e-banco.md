---
tags: [moneylog, adr, infra, aws, deploy]
status: proposto (aguarda decisão do dono nas perguntas abaixo)
data: 2026-10-07
task: T175, T176, T180 (Etapa 9)
relacionado: ADR-001, ADR-003, docs/operacao/deploy-aws.md, infra/terraform/
---

# ADR-005: topologia na AWS e banco de dados

Nada foi aplicado. Este registro descreve o que o Terraform em `infra/terraform/` cria **quando o dono o executar**.

## Decisão (recomendação)

1. **Domínio único atrás do CloudFront**: `/` serve o front (S3 privado com OAC) e `/v1/*` vai para o backend (EC2). Mesmo domínio, **sem CORS**, cookie de refresh `Secure; HttpOnly; SameSite=Strict` (ADR-003).
2. **Backend em Docker numa EC2** (`t3.micro`, IMDSv2 obrigatório, role de instância), imagem no ECR. **Sem SSH**: acesso e deploy por SSM Session Manager / Run Command. O Security Group aceita a porta 8080 **só da prefix list do CloudFront**.
3. **Banco: RDS PostgreSQL 17 (`db.t4g.micro`), sem acesso público**, acessível só pelo SG do backend. Recomendado em vez de Postgres na EC2 por: backup automático com PITR (7 dias), patches de segurança gerenciados, volume cifrado e restauração por snapshot. **Alternativa**: Postgres no container da própria EC2 (menor custo, sem RDS), aceitável se o dono topar administrar backup e atualização; neste caso o job de backup (T176) vira a única proteção e o volume precisa de snapshot do EBS.
4. **`unaccent`**: o Flyway executa `CREATE EXTENSION unaccent` (V6.01). No RDS a extensão é "trusted", mas exige que o usuário da aplicação seja o **dono do banco**. Por isso o usuário mestre do RDS é o usuário do app (`db_username`).
5. **Segredos**: nada no repositório nem no Terraform. A senha do banco é gerada pelo RDS no Secrets Manager (`manage_master_user_password`), e a configuração do app vive em **SSM Parameter Store** (SecureString), um parâmetro por variável do `.env.example`. O `deploy.sh` da instância grava cada parâmetro num arquivo com o nome da variável e monta a pasta como `/run/secrets`; o perfil `prod` lê via `spring.config.import=configtree:` (valores nunca na linha de comando nem em log).
6. **`trusted-proxies`**: o perfil `prod` **não sobe** com `MONEYLOG_TRUSTED_PROXIES` vazio. Atrás do CloudFront, informar os CIDRs do CloudFront (lista oficial em `ip-ranges.amazonaws.com`, serviço `CLOUDFRONT_ORIGIN_FACING`) para o rate limit do login enxergar o IP real. Os CIDRs mudam: o runbook inclui reavaliar a cada trimestre.
7. **Query string fora dos logs**: o termo da busca vai na URL (`GET /v1/search?q=`). Por isso a distribuição **não** liga o log padrão do CloudFront e o desenho **não usa ALB**; se um ALB for adicionado, os access logs ficam desligados.
8. **Deploy**: `ci.yml` roda build, testes, `gitleaks` e `terraform validate`; `deploy.yml` é só `workflow_dispatch`, exige aprovação do Environment `production` e assume a role por **OIDC** (sem chave estática).
9. **Backups**: bucket S3 privado, versionado e cifrado, escrito pelo job do backend (`S3BackupStorage`) com a role da instância (sem chave estática).

## Estimativa de custo (mensal, a confirmar no Calculator da AWS)

| Item | Free tier (12 meses) | Depois / sem free tier (estimativa) |
|---|---|---|
| EC2 t3.micro | 750 h grátis | ~US$ 8 |
| IPv4 público da EC2 | **não é grátis desde 02/2024** | ~US$ 3,6 |
| RDS db.t4g.micro + 20 GB gp3 | 750 h + 20 GB grátis | ~US$ 13 a 15 |
| CloudFront, S3, ECR, SSM, Secrets Manager (1 segredo) | dentro do free tier para este volume | ~US$ 1 a 2 |
| **Total** | **~US$ 4 a 6** (IPv4 + segredo) | **~US$ 25 a 30** |

Alerta: `AWS Budgets` mensal (padrão US$ 15) com avisos a 50%, 80% e 100% do real e 100% da previsão. Se o dono preferir ficar abaixo, a alternativa "Postgres na EC2" corta ~US$ 13.

## Alternativas recusadas

- **ALB na frente**: ~US$ 16 + IPv4, sem ganho para um nó só; e criaria outro log com query string.
- **ECS/Fargate, App Runner**: mais caros ou fora do free tier para um único usuário.
- **Front no mesmo container do backend**: perde cache de borda e mistura os ciclos de deploy.
- **Chave de acesso do GitHub no repositório**: substituída por OIDC.

## Não exercitado (precisa da conta AWS)

Todo o Terraform foi validado (`fmt`, `validate`) e **nunca** aplicado nem planejado contra uma conta. Não foram exercitados: a `S3BackupStorage` contra o S3 real (testada contra um S3 falso), a role da instância (IMDSv2, testada contra um IMDS falso), a assinatura do CloudFront, o `deploy.sh` na EC2 e o certificado ACM.

## Nota (ADR-018)

As fotos das metas de sonho (exibição e miniatura, até 40 MB por usuário) passam a morar no banco (`goal_photo_blobs`, `bytea`) e portanto no RDS, no snapshot e no `pg_dump`. Se o volume passar de ~1 GB, trocar o adaptador da porta `PhotoStorage` por object storage (S3/R2).

## Nota (2026-10-10): decisão de custo, EC2 sem RDS como padrão

Contas AWS novas não têm mais os 12 meses grátis de EC2/RDS/S3 (recebem créditos). Com isso, o RDS (~US$ 15 a 17/mês com armazenamento) dobraria o custo de um app de uso pessoal. **O padrão passa a ser a alternativa já prevista no item 3: Postgres 17 no Docker Compose da própria EC2**, volume EBS separado (cifrado, `prevent_destroy`), snapshot diário por DLM (7 retidos) e o `pg_dump` diário cifrado para o S3 (T176) como cópia principal. O RDS segue disponível por `database_mode = "rds"`. Também: o domínio `*.cloudfront.net` (HTTPS grátis) é aceito sem domínio próprio, a EC2 ganhou EIP (a origem do CloudFront usa o DNS público da instância), swap de 1 GB e limite de memória do container, e os logs do container vão para o CloudWatch (14 dias). Custo estimado do padrão: ~US$ 12 a 14/mês (ver o guia), contra ~US$ 27 com RDS. **Risco aceito e registrado:** o trecho CloudFront -> EC2 continua em HTTP (HTTPS na origem exige domínio próprio e proxy; pendente). Detalhes, custos por arquitetura e passo a passo: `docs/operacao/deploy-gratis-aws.md`.

## Nota (2026-10-10): borda Cloudflare como opção recomendada (`edge_mode`)

Novo `edge_mode = "cloudflare" | "cloudfront"` (aditivo; o padrão da variável continua `cloudfront`, o exemplo de tfvars recomenda `cloudflare` para quem tem o domínio na Cloudflare). No modo `cloudflare` o desenho vira Cloudflare (proxy) -> EC2 com Caddy na 443 (Origin Certificate, `Full (strict)`), sem S3 de site, CloudFront, OAC nem funções de CloudFront; o front é um zip em bucket privado de artefatos, baixado pela EC2 por SSM e trocado por symlink atômico, com rollback. O Security Group aceita só os CIDRs da Cloudflare na 443 (prefix lists próprias + SG separado para a 80 por causa da cota de 60 regras), sem 22 e sem 8080. **Isto resolve o risco "CloudFront -> EC2 em HTTP"** registrado acima, ao custo de confiar a terminação TLS e o tráfego em claro à Cloudflare (ponto único a mais, conta Cloudflare como alvo, IP de origem a manter escondido). O certificado e a chave de origem vão por SSM SecureString, nunca pelo Terraform. Custo praticamente igual ao modo `cloudfront` (~US$ 13 a 14/mês). Status: proposta, nada aplicado; o 2FA/TOTP continua sendo bloqueio de go-live. Detalhes: `docs/operacao/deploy-gratis-aws.md`, seção 11.

