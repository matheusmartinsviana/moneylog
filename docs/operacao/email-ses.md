# E-mail de convites com Amazon SES

Escopo da T8 do plano `docs/planos/2026-10-18-multiusuario-convite.md` e da ADR-032. Nada deste roteiro foi executado: o Terraform só foi validado (`fmt` e `validate`), sem `plan` nem `apply`.


> **Produção sem Terraform:** a produção foi criada à mão (sem estado do Terraform), então **não rode `terraform apply`** para o e-mail: ele tentaria criar uma infraestrutura nova. Use `scripts/setup-ses.sh` (AWS CLI, idempotente, espelha o `mail.tf`) e siga a partir da seção 2. O `mail.tf` fica como referência e para quem adotar o Terraform no futuro.

- Remetente: `convite@moneylog.mviana.tech`. Reply-To: `c@mviana.tech`. Região do SES: `us-east-1`.
- DNS na Cloudflare. O Terraform **não** cria registros DNS: ele imprime o que deve ser criado (`terraform output mail_dns_records`).
- Enquanto o sandbox do SES não for liberado, só endereços verificados recebem. Isso não bloqueia o desenvolvimento (o adaptador `fake` cobre os testes).

## 1. Recursos criados pelo Terraform (`infra/terraform/mail.tf`)

Ligados quando `mail_domain` é preenchido (vazio = nada de e-mail é criado).

| Recurso | Para quê |
|---|---|
| Identidade de domínio SES com Easy DKIM (RSA 2048) | Assina os e-mails (DKIM) |
| MAIL FROM `bounce.<mail_domain>` (`REJECT_MESSAGE` se o MX falhar) | SPF alinhado e tratamento de bounce |
| Configuration set `moneylog-<environment>` (`tls_policy=REQUIRE`, lista de supressão de bounce e reclamação) | Reputação e supressão automática. Com `REQUIRE`, destinatário cujo servidor não aceita TLS gera bounce em vez de entrega sem criptografia |
| Tópico SNS + destino de eventos `BOUNCE`, `COMPLAINT`, `REJECT` | Aviso de entrega problemática |
| Inscrição por e-mail no tópico (se `mail_alert_email`) | O dono recebe o alerta |
| Política IAM `moneylog-mail-send` no papel da EC2 | `ses:SendEmail` só na identidade e no configuration set, com `ses:FromAddress = convite@moneylog.mviana.tech`. Não há `ses:*` nem outro remetente |

As credenciais do backend vêm do papel da EC2 (cadeia padrão do SDK). Nenhuma chave de acesso é criada.

Variáveis (`terraform.tfvars`, sem segredos):

```hcl
mail_domain       = "moneylog.mviana.tech"
mail_alert_email  = "c@mviana.tech"
```

O restante tem padrão: `mail_region = "us-east-1"`, `mail_from_address = "convite@moneylog.mviana.tech"`, `mail_from_subdomain = "bounce"`, `mail_dmarc_policy = "none"`, `mail_dmarc_report_address = "c@mviana.tech"`.

Ao rodar `terraform plan`, o esperado são as adições de e-mail (identidade, MAIL FROM, configuration set, destino de eventos, tópico, política do tópico, inscrição e a política IAM) mais **dois updates in-place**: a `aws_instance` e o objeto do Caddyfile no bucket de artefatos, porque o Caddyfile entra via `file()` no `user_data` e no bucket. Qualquer destruição ou troca (`replace`) de recurso existente, em especial da instância, é inesperada: pare e investigue.

Alternativa para um primeiro `apply` só de e-mail, sem tocar a instância nem o bucket: use `-target` nos recursos de `mail.tf` (`terraform plan -target=<recurso>` e depois `apply` com os mesmos alvos; liste-os com `terraform state list` após o plan ou leia `mail.tf`). O Caddyfile entra depois, em um `apply` completo.

## 2. Registros DNS na Cloudflare (o dono cria)

Depois do `apply`, rode `terraform output mail_dns_records`. O formato é:

| Tipo | Nome | Conteúdo |
|---|---|---|
| CNAME (3x) | `<token>._domainkey.moneylog.mviana.tech` | `<token>.dkim.amazonses.com` |
| MX | `bounce.moneylog.mviana.tech` | `10 feedback-smtp.us-east-1.amazonses.com` |
| TXT | `bounce.moneylog.mviana.tech` | `v=spf1 include:amazonses.com ~all` |
| TXT | `_dmarc.moneylog.mviana.tech` | `v=DMARC1; p=none; rua=mailto:c@mviana.tech` |

Regras:

- Todos os registros em modo **somente DNS** (nuvem cinza, sem proxy).
- Os tokens de DKIM são gerados pela AWS; não invente, copie da saída do Terraform ou de `aws sesv2 get-email-identity --email-identity moneylog.mviana.tech --region us-east-1`.
- O SPF fica no subdomínio do MAIL FROM (é ele que o receptor consulta). O DMARC usa alinhamento relaxado (o padrão, sem `adkim`/`aspf`) e passa pelo DKIM do domínio.
- DMARC começa em `p=none` (observação). Depois de algumas semanas de relatórios limpos, suba para `quarantine` (`mail_dmarc_policy`) e por fim `reject`.
- O `rua` aponta para `c@mviana.tech`, que é outro domínio: alguns provedores ignoram relatórios enviados a um endereço fora do domínio avaliado (sem registro de autorização externa). Se não chegarem relatórios, use um endereço no próprio `moneylog.mviana.tech`.
- Não crie outro SPF no mesmo nome: um nome só pode ter um TXT `v=spf1`.

Verificação (propagação leva de minutos a horas):

```bash
aws sesv2 get-email-identity --email-identity moneylog.mviana.tech --region us-east-1 \
  --query '{verif:VerifiedForSendingStatus,dkim:DkimAttributes.Status,mailfrom:MailFromAttributes.MailFromDomainStatus}'
```

Esperado: `verif=true`, `dkim=SUCCESS`, `mailfrom=SUCCESS`.

## 3. Pedido de saída do sandbox (o dono faz)

Console AWS, região **us-east-1** > Amazon SES > Account dashboard > **Request production access**. Só é possível com o domínio verificado. Texto pronto (inglês, que é o idioma do suporte):

- Mail type: Transactional
- Website URL: `https://moneylog.mviana.tech`
- Contact language: Portuguese (or English)
- Additional contact addresses: `c@mviana.tech`

Use case description (itens marcados **[CONFIRMAR COM O DONO ANTES DE ENVIAR]** precisam refletir o produto real):

> Moneylog is a small personal-finance web app. We use Amazon SES only to send one kind of transactional message: an invitation e-mail containing a single-use link, sent when the account owner invites a specific person to create an account. Volume is very low (a few messages per month, never more than a few dozen **[CONFIRMAR: o teto Q17 é de 10 convites; alinhar o número ao teto real]**). We never send marketing, newsletters or bulk mail, and we only e-mail people the owner has explicitly invited, one message per invitation (plus an optional manual resend).
>
> Sender is convite@moneylog.mviana.tech with Reply-To c@mviana.tech. The domain has Easy DKIM, a custom MAIL FROM domain with SPF, and a DMARC record. The invitation expires in a few days **[CONFIRMAR: prazo real de expiração]** and tells the recipient to ignore the message if they did not expect it **[CONFIRMAR: o e-mail realmente traz esse aviso]**.
>
> Bounces and complaints: we use a configuration set that publishes BOUNCE, COMPLAINT and REJECT events to an SNS topic subscribed by the account owner, and the account-level suppression list (bounces and complaints) is enabled. Any address that bounces or complains is not contacted again; the owner reviews each event and removes or corrects the invitation manually. Recipients are never added to a list, so there is no unsubscribe flow: every message is a one-off response to an action by the owner.

Dica: respostas curtas e concretas costumam passar na primeira. Se pedirem mais informação, responda no mesmo caso (normalmente em até 24 h).

Quando aprovado:

```bash
aws sesv2 get-account --region us-east-1 --query '{prod:ProductionAccessEnabled,sending:SendingEnabled}'
```

Esperado: `prod=true`.

## 4. Variáveis do backend em produção

Em produção o servidor lê a configuração do SSM: o `user_data` baixa `<ssm_prefix>/NOME` para `/opt/moneylog/secrets`, montado em `/run/secrets`, e o backend importa cada arquivo como propriedade (`configtree`). Este é o único caminho em produção; o `.env` do servidor só guarda `IMAGE`. Parâmetros (não secretos, podem ser `String`):

| Nome | Valor |
|---|---|
| `MAIL_PROVIDER` | `ses` |
| `MAIL_FROM` | `convite@moneylog.mviana.tech` |
| `MAIL_REPLY_TO` | `c@mviana.tech` |
| `MAIL_SES_REGION` | `us-east-1` |
| `MAIL_SES_CONFIGURATION_SET` | saída `mail_configuration_set` (`moneylog-prod`) |

As variáveis `MAIL_*` do `docker-compose.prod.yml` valem só para esse compose standalone, fora do servidor da AWS. Até a aprovação do sandbox mantenha o flag de convites desligado em produção.

## 5. Teste de entrega (critério de aceite)

1. Enquanto estiver no sandbox, verifique o seu Gmail como identidade (SES > Identities > Create identity > Email address) ou use `success@simulator.amazonses.com`.
2. Envie um e-mail de teste:

```bash
aws sesv2 send-email --region us-east-1 \
  --from-email-address convite@moneylog.mviana.tech \
  --reply-to-addresses c@mviana.tech \
  --configuration-set-name moneylog-prod \
  --destination ToAddresses=<seu-gmail> \
  --content 'Simple={Subject={Data=Teste},Body={Text={Data=Teste de entrega}}}'
```

3. No Gmail: menu > Mostrar original. Esperado: `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.

## 6. Tratamento de bounce e reclamação

- O alerta chega por e-mail (inscrição do SNS; confirme o link da AWS na primeira vez).
- `BOUNCE` permanente ou `COMPLAINT`: o SES suprime o endereço automaticamente. No app, o convite fica com falha de entrega; confira o e-mail digitado, corrija e reenvie (um endereço suprimido continua recusado até ser removido: `aws sesv2 delete-suppressed-destination --email-address <e-mail> --region us-east-1`, só após confirmar com a pessoa).
- Taxa de bounce acima de 5% ou de reclamação acima de 0,1% pode suspender o envio da conta: com o volume deste app, qualquer ocorrência merece olhar.
- O corpo do e-mail e o token nunca são registrados em log (T4).

## 7. Cabeçalhos da página `/convite` (Caddy)

`infra/caddy/Caddyfile` responde o HTML de `/convite` e `/convite/*` com `Referrer-Policy: no-referrer` e `Cache-Control: no-store` (os demais caminhos mantêm `strict-origin-when-cross-origin`). O token fica no fragmento da URL, que o navegador não envia ao servidor, então o log de acesso do Caddy não o contém. O Caddyfile é embutido no `user_data` e também enviado ao bucket de artefatos; aplique como descrito em `docs/operacao/deploy-gratis-aws.md` (recarregar o Caddy).

Verificação:

```bash
curl -sI https://moneylog.mviana.tech/convite | grep -i -E 'referrer-policy|cache-control'
```

Esperado: `referrer-policy: no-referrer` e `cache-control: no-store`.

## 8. Pendências do dono

1. Aplicar o Terraform (`mail_domain`) depois de revisar o `plan`.
2. Criar os registros DNS da seção 2 na Cloudflare.
3. Abrir o pedido de saída do sandbox (seção 3).
4. Confirmar a inscrição do SNS por e-mail.
5. Criar os parâmetros SSM da seção 4 e reaplicar o Caddyfile.
