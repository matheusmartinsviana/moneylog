# ADR-033: envio de e-mail pela porta EmailSender e Amazon SES

Status: **PROPOSTA** (2026-10-20). Complementa o ADR-032 (multiusuário e convite), que recomendou registrar a porta de e-mail e o SES em um ADR separado. Operação do SES: `docs/operacao/email-ses.md`. Plano: `docs/planos/2026-10-18-multiusuario-convite.md` (T4 e T8). Código descrito nas branches `feat/multiusuario-t4-email` e `feat/multiusuario-t5-convites` do backend.

## Contexto
O convite do ADR-032 só funciona se o link chegar à pessoa. O backend não enviava e-mail. Era preciso uma forma de enviar que:
- não prenda o `core` a um fornecedor (o core é Java puro, BE 01);
- funcione em dev e em teste sem AWS;
- não vaze o token do convite em log e não derrube o servidor quando o e-mail falha;
- caiba no free tier e no volume do app (poucos e-mails por mês, teto de 10 usuários, Q17).

## Decisão

### 1. Porta no core, adaptadores na infra
- `EmailSender` (`core/mail/app/gateways`) tem um método, `send(EmailMessage)`, que devolve `EmailDelivery` (id da mensagem). O core também tem `EmailTemplate`, `EmailMessage`, `RenderedEmail`, `InvitationEmailModel` e `EmailDeliveryException`.
- Adaptadores em `infra/mail`, escolhidos por `MAIL_PROVIDER` no `MailConfig`:

| Valor | Adaptador | Uso |
|---|---|---|
| `ses` | `SesEmailSender` | Produção. Exige `MAIL_FROM` e `MAIL_SES_REGION` (validada), aceita `MAIL_REPLY_TO` e `MAIL_SES_CONFIGURATION_SET` |
| `log` | `LogEmailSender` | Dev. Registra id, destinatário mascarado e assunto. O link do convite só aparece no log com o perfil `dev` |
| `fake` | `FakeEmailSender` | Testes. A subida **falha** se `fake` for usado com o perfil `prod` |
| `none` (padrão) | `DisabledEmailSender` | Envio desligado |

- `MAIL_PROVIDER=none` **lança `EmailDeliveryException` de propósito** em vez de fingir sucesso. Assim, sem e-mail configurado, o convite nunca parece enviado: ele fica `FAILED` e a resposta é `502`. Valor desconhecido de `MAIL_PROVIDER` impede a subida.
- O ArchUnit (`ArchitectureTest`) proíbe o `core` de depender de `software.amazon..` (junto de Spring, Jackson e Lombok). O AWS SDK só aparece em `MailConfig` e `SesEmailSender`.

### 2. SDK e credenciais
- AWS SDK for Java v2 **2.57.0**, só os módulos `sesv2` e `url-connection-client`. `apache5-client` e `netty-nio-client` são excluídos do `sesv2` no `pom.xml`, para manter o artefato e o consumo de memória pequenos na instância do free tier.
- O cliente usa `DefaultCredentialsProvider` (cadeia padrão do SDK). Em produção isso resolve para o papel da instância EC2, cuja política IAM (`moneylog-mail-send`) só permite `ses:SendEmail` na identidade e no configuration set, com `ses:FromAddress = convite@moneylog.mviana.tech`. **Nenhuma chave de acesso é criada ou guardada.** As credenciais de backup e de infra não são reaproveitadas para o e-mail: o envio usa só a identidade da instância, com a política mínima acima.
- Timeouts do cliente: conexão 5 s, leitura 10 s, chamada total 15 s. Falha do SDK (`SdkException`) vira `EmailDeliveryException` com mensagem genérica; o log traz destinatário mascarado, tipo, status HTTP e código AWS, nunca o corpo nem o token.

### 3. Configuração validada na subida
`MailProperties` falha rápido em configuração inválida:
- `MAIL_FROM` e `MAIL_REPLY_TO` precisam ser um único endereço;
- `MAIL_APP_BASE_URL` (padrão `https://moneylog.mviana.tech`) precisa ser **https**, sem usuário (`userinfo`), query nem fragmento; `http` só vale para `localhost` ou `127.0.0.1` **fora de produção**. A base monta o link `<base>/convite#<token>` (ADR-032, seção 4), então um valor adulterado levaria o token a outro host.

### 4. Template
`EmailTemplateRenderer` carrega `mail/invitation.html` e `mail/invitation.txt` e troca os `{{placeholder}}` (`inviterEmail`, `inviteeEmail`, `link`, `expiresAt`, `validity`). `{{validity}}` vem da política (`"7 dias"` ou `"1 dia"`), então o texto não fica fixo se a validade mudar. No HTML os valores são escapados; placeholder sem valor lança erro. O assunto atual é "Você foi convidado para o Monelog".

### 5. Envio fora da transação e estado de entrega
- `InviteUserUseCaseImpl` e o reenvio chamam `InvitationIssuer.issue` (transacional: valida, grava o convite) e depois `InvitationDispatcher.deliver`, **sem transação aberta**. A chamada de rede ao SES nunca segura conexão do banco nem uma transação, e um erro de envio não desfaz o convite.
- O convite é gravado com `delivery_status = FAILED`. Após o envio, `recordDelivery` (transacional, com `findByIdForUpdate`) grava `SENT` ou mantém `FAILED`. **Confere o `tokenHash`**: se um `resend` trocou o token enquanto o envio anterior estava em andamento, o resultado do envio antigo é descartado e não sobrescreve o estado do convite novo.
- Falha de envio: `502 EMAIL_DELIVERY_FAILED` (`problem+json`) com `invitationId`; o dono usa `resend`, que reenvia sem duplicar o convite. Qualquer `RuntimeException` do envio ou da renderização é tratada como falha de entrega.

### 6. Remetente, região e política de domínio
- Remetente `convite@moneylog.mviana.tech`, `Reply-To` `c@mviana.tech`, região `us-east-1` (Q13).
- Domínio com Easy DKIM, MAIL FROM `bounce.moneylog.mviana.tech` (SPF alinhado) e DMARC iniciando em `p=none`. Configuration set com `tls_policy=REQUIRE`, lista de supressão e eventos `BOUNCE`, `COMPLAINT` e `REJECT` em tópico SNS que avisa o dono.
- O Terraform (`infra/terraform/mail.tf`) só cria recursos quando `mail_domain` é preenchido; vazio, nada de e-mail existe. Ele foi validado (`fmt` e `validate`), mas **não aplicado**.
- **O DNS é manual:** o DNS fica na Cloudflare, fora do Terraform. O Terraform apenas imprime os registros (`terraform output mail_dns_records`) e o dono os cria em modo somente DNS.
- **Sandbox do SES (Q16):** enquanto a conta estiver no sandbox, só endereços verificados recebem. A saída é um pedido manual no console. Isso bloqueia a liberação a convidados reais (flag `moneylog.invitations.enabled` em produção), não o desenvolvimento.

## Alternativas descartadas
- **SMTP genérico (Spring Mail / Jakarta Mail contra o SMTP do SES ou de outro provedor).** Exigiria uma credencial SMTP (segredo) guardada no SSM e rotacionada, enquanto o SES por API usa o papel da instância sem segredo algum. Também perde o configuration set e os eventos de bounce por API. Como a porta isola o fornecedor, adotar SMTP depois custa só um adaptador novo.
- **Outro provedor (Resend, SendGrid e similares).** Adiciona conta, chave de API e DNS em um serviço a mais, fora do free tier e da conta AWS onde o app já roda (ADR-001). Fica como adaptador futuro se o SES for um problema.
- **Fila ou outbox para o envio.** Garantiria reenvio automático, mas acrescenta tabela, worker e política de retentativa para um volume de poucos e-mails por mês. O estado `delivery_status` já torna a falha visível e o `resend` manual é idempotente. Reavaliar se o volume ou a criticidade subirem.

## Consequências
- O core permanece sem AWS; trocar o fornecedor mexe só em `infra/mail` e `MailConfig`.
- Sem `MAIL_PROVIDER=ses` configurado, convidar responde `502`: é o comportamento esperado, não um defeito.
- Em dev, `MAIL_PROVIDER=log` permite testar o fluxo inteiro sem AWS; o link no log só aparece no perfil `dev`.
- A mensagem de erro do envio é genérica; o diagnóstico fica no log (status e código AWS), sem destinatário completo nem token.

## Riscos
- **Reenvio sem limite de frequência.** O `resend` do dono não tem intervalo mínimo nem cota. O volume é limitado pelo teto de usuários e só o dono chama a rota, mas um reenvio repetido pode gerar mais e-mails ao mesmo endereço, reclamação e pior reputação do SES. Mitigação atual: bounce e reclamação suprimem o endereço e avisam o dono.
- **Sandbox.** Sem a aprovação, convidados não verificados não recebem, mesmo com tudo configurado.
- **DNS e reputação.** SPF, DKIM e DMARC dependem de o dono criar os registros corretamente; DMARC em `p=none` não bloqueia falsificação até ser endurecido.
- **Falha entre envio e gravação.** Se o SES aceitar e o `recordDelivery` falhar, o convite continua `FAILED` apesar de entregue. O `resend` corrige, ao custo de um segundo e-mail (o token anterior morre).
- **Sem retentativa automática.** Falha transitória do SES exige reenvio manual do dono.

## Pendente de decisão do dono
1. **Marca e assunto do e-mail.** Hoje o assunto é "Você foi convidado para o Monelog" e o corpo assina "Monelog". Confirmar nome, assunto e tom (DS 00..01) antes de liberar a convidados.
2. **Intervalo mínimo entre reenvios** (por exemplo, recusar `resend` dentro de N minutos do último envio) e se deve haver teto de reenvios por convite. Hoje não existe limite.
