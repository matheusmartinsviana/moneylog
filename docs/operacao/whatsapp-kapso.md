# Runbook: WhatsApp via Kapso (ADR-035, T13)

Roteiro para ligar, operar, rotacionar e desligar o canal WhatsApp do Monelog. Fonte das decisões: `docs/adrs/ADR-035-whatsapp-via-kapso.md` (seções 3, 7, 11, 12, 18, 19, 22, 26 a 29) e o plano `docs/planos/2026-10-22-whatsapp-kapso.md`.

> **Estado em 2026-10-24.** Todo o código está no backend com os padrões seguros: `WHATSAPP_ENABLED=false`, `WHATSAPP_DISPATCH_ENABLED=false`, `AI_PROVIDER=none`. Com os padrões, o app sobe sem nenhuma variável `KAPSO_*`, de pepper ou de cifra; o webhook responde `404` e o vínculo responde `422 WHATSAPP_NOT_ENABLED`. **Nada neste runbook foi exercitado contra a Kapso, a Meta ou a OpenAI reais** (G0 não executado): tudo que depende deles está marcado como inferência até o dono rodar o G0.

## 1. Portões de liberação (nada liga antes)

| Portão | Situação | Quem |
|---|---|---|
| G0 itens 1 a 9 respondidos (seção 2) | pendente | dono, com número de teste |
| T10a entregue (`PARAR`/`RETOMAR` e despachante respeitando `paused`) | entregue em 2026-10-23 (ADR-035 seções 27 e 28) | feito |
| Texto do consentimento v1 aprovado (Q24) | proposta no ADR-035 seção 11, falta o dono | dono |
| T10b (templates fora da janela de 24 h) | **código entregue, flag `WHATSAPP_TEMPLATES_ENABLED=false`**; formato da API e códigos de erro NAO VALIDADOS; só liga depois do G0 itens 3 e 4 (seção 9) | dono (G0) |
| Termos da OpenAI (retenção zero, sem treino, DPA) | pendente (G0 item 9); `AI_PROVIDER=none` até lá | dono |
| DPA da Kapso e da Meta | pendente (G0 item 5) | dono |

Ligar `WHATSAPP_ENABLED` exige a T10a (opt-out) entregue: já está. Ligar `WHATSAPP_DISPATCH_ENABLED` sem os templates é permitido, mas quase só alcança quem escreveu nas últimas 24 h (seção 9).

## 2. G0: o que o dono precisa responder (número de teste, `kapso` CLI)

Salve fixtures **sem dado real** (telefone, nome e valores fictícios). Os itens mudam o código (T2, T5a, T5b, T10b, T8b), então registre o resultado no ADR-035 como confirmado ou corrigido.

1. Payload real de `whatsapp.message.received`: **FEITO em 2026-10-24** (v2). `message.from` traz telefone só com dígitos; o BSUID vem em `message.from_user_id` e `conversation.business_scoped_user_id`; `x-webhook-payload-version: v2`. Detalhes no ADR-035 seção 12.
2. `message.timestamp`: **FEITO**, string de epoch em **segundos** (UTC). **PENDENTE (dono):** conferir o HMAC hex dos **bytes crus** com o segredo real (`x-webhook-signature` tem 64 hex, mas a conferência com o segredo ainda não foi feita) e se `X-Idempotency-Key` muda entre reentregas.
3. Criar e submeter **4 templates `UTILITY`** em `pt_BR` (código `pt_BR`, não `pt-BR`) com **parâmetros nomeados** (`{{nome}}`, não `{{1}}`): vencimento de fatura/dívida, recorrência pendente, alerta de segurança, resumo semanal. Anotar nome, estado, prazo e parâmetros.
4. Texto livre fora da janela de 24 h (qual erro volta?). Confirmar as **inferências do cliente T3, nunca observadas**: base `https://api.kapso.ai/meta/whatsapp/v24.0`; rota `POST {base}/{phone_number_id}/messages`; autenticação por `X-API-Key` (não `Authorization: Bearer`); corpo com `recipient_type=individual`, `preview_url=false` e `to` só dígitos; resposta com `messages[0].id`. Se alguma estiver errada, todo envio falha em `HTTP_4xx`.
5. Plano da Kapso, limites, custo de template (Q9), se o número "Testing" é sandbox, **retenção do histórico e dos áudios, como apagar conversa/contato/mídia (Q25) e o DPA da Kapso e da Meta** (papel de operador, subprocessadores, transferência internacional).
6. Tamanho típico do payload, ausência de lote com buffering desligado, e se a Kapso envia de **IP fixo** (define se dá para filtrar por IP na Cloudflare).
7. Áudio: o payload traz `kapso.transcript.text`? No mesmo evento ou depois? Custo e idioma; números em dígitos ou por extenso; duração e `byte_size` de 10 a 30 s.
8. Mídia: consulta `GET {base}/{media_id}?phone_number_id=...` com `X-API-Key`, resposta `url`, `mime_type` e `file_size`; o download exige `X-API-Key`?; **quais hosts aparecem na URL** (vão para `WHATSAPP_MEDIA_ALLOWED_HOSTS`); a URL expira em 5 min?; qual o `content_type` real da nota de voz (esperado `audio/ogg; codecs=opus`) e se vem `aac`/`amr` (a OpenAI não aceita; viram "digite o valor").
9. OpenAI (Q30): preços oficiais de `gpt-5-nano` e `gpt-4o-mini-transcribe`, termos de retenção zero e sem treino **para a organização da chave usada**, DPA, limites de requisição e custo real de um áudio de 30 s em português.

Quem depende de quem: 1 e 2 mudam T2/T5a/T5b; 3 e 4 mudam T10b; 5 vai ao dono (Q9, Q24, Q25); 7 e 8 decidem T8b; 9 libera a IA em produção.

## 3. Variáveis

Nomes e padrões estão em `backend/.env.example` (valores vazios) e `backend/src/main/resources/application.yaml`. O `docker-compose.prod.yml` repassa ao container todas as variáveis `KAPSO_*`, `WHATSAPP_*`, `MONEYLOG_WHATSAPP_*` e `AI_*` do `application.yaml`, com os mesmos padrões do yaml. Nenhum valor real no repositório.

| Variável | Padrão | Observação |
|---|---|---|
| `WHATSAPP_ENABLED` | `false` | Com `true` o app **não sobe** sem `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, `KAPSO_WEBHOOK_SECRET` (mínimo 16 caracteres), `WHATSAPP_BUSINESS_NUMBER`, `WHATSAPP_PHONE_PEPPER` (mínimo 32) e `WHATSAPP_PHONE_ENC_KEY`. No perfil `prod` os valores de desenvolvimento são recusados e `WHATSAPP_PROVIDER=fake` também. |
| `WHATSAPP_PROVIDER` | `kapso` | `fake` só em dev e teste. |
| `WHATSAPP_DISPATCH_ENABLED` | `false` | Liga o despachante de avisos proativos (mesmo cron do `NotificationJob`, a cada 15 min). Exige `WHATSAPP_ENABLED=true`. |
| `KAPSO_API_KEY` | vazio | Segredo. |
| `KAPSO_PHONE_NUMBER_ID` | vazio | Id do número na Kapso/Meta. |
| `KAPSO_WEBHOOK_SECRET` / `KAPSO_WEBHOOK_SECRET_PREVIOUS` | vazio | Segredo do HMAC; o anterior só durante a rotação. |
| `KAPSO_BASE_URL` | `https://api.kapso.ai/meta/whatsapp/v24.0` | Inferência até o G0 item 4. Só `https` (http só em localhost). |
| `WHATSAPP_BUSINESS_NUMBER` | vazio | Só dígitos com DDI. |
| `WHATSAPP_DAILY_OUTBOUND_LIMIT` | `5` | Teto diário de avisos iniciados por nós (`0` ou menos = sem teto). Segurança não conta. |
| `WHATSAPP_WEBHOOK_QUEUE_SIZE` | `100` | Fila cheia = evento `DROPPED` e pedido de reenvio. |
| `WHATSAPP_WEBHOOK_SIGNATURE_FAILURES_PER_IP` | `120` | Falhas de assinatura por IP em 5 min antes do `429`. |
| `WHATSAPP_SECURITY_QUEUE_SIZE` | `50` | Fila dos alertas de segurança; cheia = alerta de WhatsApp descartado com log, o push segue. |
| `WHATSAPP_AUDIO_MAX_SECONDS` / `WHATSAPP_AUDIO_MAX_BYTES` | `60` / `1048576` | Limites do áudio. |
| `WHATSAPP_MEDIA_ALLOWED_HOSTS` | vazio | Vazio recusa **todo** download de mídia (áudio sem `transcript` fica sem tratamento). Ver seção 7. |
| `WHATSAPP_PHONE_PEPPER` | vazio | Segredo. Ver seção 6. |
| `WHATSAPP_PHONE_ENC_KEY` | vazio | `<id>:<32 bytes em base64>`. |
| `WHATSAPP_PHONE_ENC_KEYS_PREVIOUS` | vazio | Chaves antigas, separadas por vírgula, mesmo formato. |
| `MONEYLOG_WHATSAPP_MAX_AMOUNT`, `_MAX_ENTRIES_PER_DAY`, `_MAX_EXPENSE_PER_DAY`, `_MAX_INCOME_PER_DAY` | vazio (sem limite) | Tetos opcionais do lançamento por WhatsApp. Valores em reais com ponto (`1000.00`). Decisão do dono: desligados. |
| `AI_PROVIDER` | `none` | `openai` só depois do G0 item 9. |
| `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | vazio | `AI_MODEL` vazio com `openai` = `gpt-5-nano`; `AI_BASE_URL` sem `/v1`. Modelos de texto suportados: `gpt-5-nano`, `gpt-5-mini`, `gpt-5`, `gpt-4o-mini`; outros de raciocínio (`gpt-5.1`, `o4-mini`) vêm cortados e a IA é ignorada. |
| `AI_TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe` | Só vale com `AI_PROVIDER=openai`. |
| `AI_MONTHLY_AUDIO_SECONDS` | `1800` | Orçamento mensal de áudio (30 min), mês de São Paulo. Estourou: "não consegui entender o áudio, digite o valor". |

Atenção ao Spring: variável **definida e vazia** vence o padrão do `application.yaml`. Por isso o compose usa os mesmos padrões do yaml nas variáveis que têm padrão não vazio. Ao colar variáveis num `.env`, apague a linha em vez de deixá-la vazia quando quiser o padrão.

### Onde guardar os valores

- **AWS (`deploy-gratis-aws.md`):** um parâmetro SSM por variável, `SecureString` para segredos, sob `/moneylog/prod/`. O `deploy.sh` da instância baixa cada um para `/opt/moneylog/secrets/<NOME>` e o Spring lê por `configtree`, então **não é preciso mudar o compose gerado pelo Terraform** para nenhuma variável deste runbook. Parâmetro vazio não existe no SSM: não crie o que quer deixar no padrão.
- **Servidor único com `docker-compose.prod.yml`:** somente `backend/.env` (não versionado, `--env-file`). O compose **não** monta `./secrets` nem define `SECRETS_DIR`, então arquivo de segredo ali não é lido (o comentário do cabeçalho do compose é anterior e engana). Nesse modo os segredos viajam como variáveis de ambiente do container e ficam visíveis em `docker inspect` e `/proc` para quem tem acesso ao host; na AWS são arquivos 400 do uid do container.
- Nunca em repositório, ticket, chat, log ou fixture. Os testes usam valores sentinela.

## 4. Ordem de ativação

0. **Pré-checagem dos obrigatórios (antes de criar `WHATSAPP_ENABLED`).** Confirme que existem no SSM, com valor não vazio: `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, `KAPSO_WEBHOOK_SECRET` (16+ caracteres), `WHATSAPP_BUSINESS_NUMBER` (só dígitos com DDI), `WHATSAPP_PHONE_PEPPER` (32+ caracteres) e `WHATSAPP_PHONE_ENC_KEY` (`<id>:<base64 de 32 bytes>`). Liste só os nomes, nunca os valores: `aws ssm get-parameters-by-path --path /moneylog/prod --query 'Parameters[].Name' --output text`. Pepper e chave de cifra não podem ser os valores de desenvolvimento. Confirme também os dois ajustes de produção das seções 10 e 11 (pool e logger), que são pré-requisitos de ligar o canal.
1. **Gerar os segredos** na sua máquina (não imprima em tela compartilhada; não cole em histórico de shell que sincronize):
   - `KAPSO_WEBHOOK_SECRET`: `openssl rand -hex 32`
   - `WHATSAPP_PHONE_PEPPER`: `openssl rand -base64 48`
   - `WHATSAPP_PHONE_ENC_KEY`: `v1:` + `openssl rand -base64 32` (o prefixo é o id gravado na linha; guarde também numa cópia segura, perder a chave perde os telefones cifrados e obriga a revincular).
2. **Carregar no SSM** (seção 3): os três acima, `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_NUMBER`. Ainda **não** crie `WHATSAPP_ENABLED`.
3. **Deploy com as flags em `false`** (`scripts/deploy-backend.sh`). Confirme `/actuator/health` `UP` e que `POST /v1/integrations/whatsapp/webhook` responde `404` (recurso desabilitado). Nada muda para quem já usa o app. **Não registre o webhook na Kapso ainda**: com a flag desligada ela só vê `404` e retenta em loop.
4. **G0 (captura dos payloads) sem a Kapso ver `404` em loop.** Os itens 1, 2 e 6 exigem payload real. Opções, em ordem de preferência:
   - **Local com túnel (preferida):** suba o backend local (`./moneylog up`, `WHATSAPP_ENABLED=true` com segredos de teste só no `backend/.env`) e exponha só o caminho do webhook por um túnel temporário que você controla; registre esse URL temporário no webhook da Kapso (número de teste), capture os eventos, salve fixtures **sem dado real** e remova o webhook e o túnel ao terminar. Produção continua em `404` e sem registro na Kapso. (Ferramenta de túnel e comando da CLI: a validar, não há comando testado aqui.)
   - **Captura na própria Kapso:** se a CLI ou o painel mostrar o corpo e os cabeçalhos entregues (log de entregas), use-os para o G0 itens 1, 2 e 6 sem receptor próprio.
   - **Produção com a flag ligada, só se as duas anteriores não servirem:** execute o passo 6 antes de registrar o webhook; assim o primeiro evento já recebe `200`/`401`, nunca `404`.
   Corrija o ADR com o que for observado. Sem G0 itens 1 e 2 não se liga nada em produção.
5. **Registrar o webhook de produção na Kapso** (CLI `kapso` ou painel; o comando exato e o "buffering desligado" dependem da CLI e **não foram validados**): URL `https://<seu-domínio>/v1/integrations/whatsapp/webhook`, eventos **somente** `whatsapp.message.received` e `whatsapp.message.failed` (não assine `conversation.created` nem outros), debounce/buffering **desligado**, segredo = `KAPSO_WEBHOOK_SECRET`. Só depois do passo 6.
6. **`WHATSAPP_ENABLED=true`** (parâmetro SSM e novo deploy). Faça **antes** do passo 5. O app falha na partida se faltar segredo, sem imprimir valor. **Risco de partida falha:** o `deploy.sh` da instância só volta para a tag anterior quando a tag nova difere da atual. Se você ligar a flag com segredo faltando e refizer o deploy **da mesma tag**, o "rollback" sobe a mesma imagem com a mesma configuração e a produção fica fora do ar, porque os segredos vêm do SSM e não da imagem. Conserto: apague o parâmetro `WHATSAPP_ENABLED` (ou ponha `false`) no SSM e refaça o deploy da mesma tag; `--rollback` não resolve isto. Depois valide com o número de teste: o webhook responde `200` com assinatura válida e `401` com assinatura errada; `VINCULAR <código>` vincula; `PARAR`/`RETOMAR` respondem; `mercado 35,50` grava um gasto e responde.
7. **`WHATSAPP_DISPATCH_ENABLED=true`: portão duro.** Só com **todos** estes itens atendidos: (a) T10b entregue e os 4 templates aprovados (G0 item 3), ou o dono ter aceito por escrito que, sem template, o canal proativo só alcança quem escreveu nas últimas 24 h e que o alerta de segurança por WhatsApp e o resumo semanal fora da janela não saem; (b) pool do agendador em 3 (seção 10); (c) logger `SqlExceptionHelper` ajustado (seção 11). Valide um aviso de fatura de teste.
8. **IA e áudio:** só com o G0 item 9 aprovado pelo dono: `AI_PROVIDER=openai`, `AI_API_KEY` e `WHATSAPP_MEDIA_ALLOWED_HOSTS` (hosts reais do G0 item 8, seção 7). Antes disso o áudio só funciona quando a Kapso entrega `kapso.transcript.text` no payload.

Critério de aceite da T13: com o roteiro seguido do zero e o número de teste, o webhook chega à produção com `200` e assinatura válida; com `WHATSAPP_ENABLED=false` a aplicação sobe sem nenhuma variável `KAPSO_*` nem de cifra.

## 5. Desligar e reverter

| Quero | Faça | Efeito |
|---|---|---|
| Parar só os avisos proativos | `WHATSAPP_DISPATCH_ENABLED=false` e deploy | Lançar e consultar seguem. Linhas `PENDING` viram `FAILED(STUCK)` sozinhas, sem reenvio. |
| Desligar IA e áudio por download | `AI_PROVIDER=none` e deploy | O parser determinístico segue; áudio sem `transcript` vira "digite o valor". |
| Desligar o canal inteiro | **primeiro desative o webhook na Kapso**, depois `WHATSAPP_ENABLED=false` e deploy | Webhook `404`, vínculo `422`, nenhum envio. Dados e vínculos ficam no banco (telefone cifrado). Sem o primeiro passo a Kapso retenta em `404` e acumula erro. |
| Voltar a versão | `scripts/deploy-backend.sh --rollback` | **Seguro só antes de o canal gravar dados novos** (ver ressalva abaixo). Depois disso, prefira desligar as flags e seguir adiante (roll-forward). |
| Cortar um usuário | o usuário (ou o dono) revoga o vínculo no app | Apaga telefone cifrado, código e identidade; histórico de lançamentos e auditoria ficam (ledger imutável). |

**Ressalva do rollback de versão (A1).** As migrações são aditivas, mas V9.31 e V9.33 **trocam CHECKs** para aceitar `transactions.source = 'WHATSAPP'` e `notifications.kind = 'WEEKLY_SUMMARY'`. O código atual lê `source` como enum JPA (`TransactionEntity.source`) e `kind` com `NotificationKind.valueOf(...)` (`NotificationGatewayImpl`, `NotificationSettingsGatewayImpl`). **Inferência, a confirmar pelo Backend:** a imagem anterior não conhece esses valores, então lê-los provavelmente lança exceção (enum desconhecido) e quebra a listagem de lançamentos e/ou de notificações, justamente no financeiro. Procedimento seguro:
1. Se ainda **não existe** linha com `source = 'WHATSAPP'` nem `kind = 'WEEKLY_SUMMARY'` (`SELECT count(*) FROM transactions WHERE source = 'WHATSAPP';` e `SELECT count(*) FROM notifications WHERE kind = 'WEEKLY_SUMMARY';`, ambos 0), o `--rollback` é seguro. Lembre que o resumo semanal é gerado **para todos os usuários** no domingo à noite, mesmo sem WhatsApp ligado, então o segundo contador sobe sozinho com o código novo no ar.
2. Se existem, **não volte a imagem**: desligue as flags (tabela acima) e corrija para frente com uma nova versão. O lançamento `WHATSAPP` é dado financeiro legítimo e não deve ser apagado nem reclassificado às pressas (PR 01: o razão é imutável; estorno se for erro).
3. Linhas `WEEKLY_SUMMARY` são só notificações da central e podem ser arquivadas/apagadas por quem tem o aval do dono, mas isso exige SQL manual e backup antes (`docs/operacao/backup.md`); e as migrações V9.30 a V9.33 **não** são revertidas (não há migração de volta).

**Ao revogar um vínculo, apague a conversa, o contato e os áudios no painel da Kapso** (Q25): o Monelog não consegue apagar o que está na Kapso. O consentimento diz ao usuário que ele apaga no painel; na prática quem opera o painel é o dono.

## 6. Rotação de chaves

Todas sem janela de indisponibilidade, em dois deploys.

**Segredo do webhook (`KAPSO_WEBHOOK_SECRET`)**
1. Gere o novo. No SSM: `KAPSO_WEBHOOK_SECRET_PREVIOUS` = valor atual; `KAPSO_WEBHOOK_SECRET` = novo. Deploy.
2. Na Kapso, troque o segredo do webhook para o novo. Eventos assinados com qualquer um dos dois passam (comparação em tempo constante).
3. Confirme um evento real com o novo; então apague `KAPSO_WEBHOOK_SECRET_PREVIOUS` do SSM e faça deploy.

**Chave de cifra do telefone (`WHATSAPP_PHONE_ENC_KEY`)**
1. Gere `v2:` + 32 bytes novos. `WHATSAPP_PHONE_ENC_KEYS_PREVIOUS` = a chave atual (`v1:...`, mantendo todas as anteriores, separadas por vírgula); `WHATSAPP_PHONE_ENC_KEY` = a nova. Deploy.
2. Linhas novas gravam com `v2`; as antigas continuam decifrando pelo id. **Não remova uma chave antiga enquanto existir linha com aquele id** (vínculo `VERIFIED` ou `PENDING`); não há job de recifragem. Confira antes: `SELECT enc_key_id, count(*) FROM whatsapp_links WHERE phone_enc IS NOT NULL GROUP BY 1;` e o mesmo em `whatsapp_webhook_events` com `payload_enc IS NOT NULL` (o corpo pendente do evento também é cifrado com o id da chave e some ao concluir). As consultas não mostram telefone.

**Pepper (`WHATSAPP_PHONE_PEPPER`)**
- **Não rotacione com vínculos ativos.** O pepper gera `phone_hmac`, `wa_identity_hmac`, o hash do código e do corpo; trocá-lo faz nenhum remetente casar com o vínculo (mensagens viram silêncio) e quebra a unicidade. Não há rotação em dois valores. Se for inevitável (vazamento): comunique os usuários, revogue todos os vínculos, troque o pepper, faça deploy e peça nova vinculação.

**Chave da Kapso (`KAPSO_API_KEY`) e da OpenAI (`AI_API_KEY`)**
- Crie a nova no provedor, atualize o SSM, faça deploy, revogue a antiga. Entre o deploy e a revogação as duas funcionam.

## 7. Host de mídia (`WHATSAPP_MEDIA_ALLOWED_HOSTS`)

- Começa **vazio** (recusa todo download). Preencha só com os hosts exatos vistos no G0 item 8, separados por vírgula, sem curinga e sem subdomínio implícito.
- **PROIBIDO** colocar domínio compartilhado onde terceiros criem registros (hospedagem de uso geral, CDN com subdomínio livre, "*.cloudfront.net", buckets públicos): permitiria DNS rebinding/SSRF por um registro controlado por outra pessoa. Só o host do próprio provedor de mídia (Kapso/Meta) confirmado no G0.
- O download já é feito só por `https`, sem porta, sem credencial, sem redirecionamento, com endereço público obrigatório, tipo `audio/*` permitido e 8 s no total (ADR-035 seção 22). A chave da Kapso nunca vai ao host de mídia.
- Se o G0 mostrar que a Kapso não entrega a URL e sim exige `X-API-Key` no download, isso é mudança de código (T8b): não improvise com variável.

## 8. Borda: Caddy e Cloudflare

O `infra/caddy/Caddyfile` **não muda** (mudança só com aprovação do dono):
- `/v1/*` já passa pelo Caddy com corpo JSON limitado a **1 MB** (o backend corta o webhook em **64 KB**, `413 PAYLOAD_TOO_LARGE`).
- O IP do visitante vem de `CF-Connecting-IP`, aceito só de CIDR da Cloudflare; o Caddy repassa um único `X-Forwarded-For` limpo e o backend confia nele (`MONEYLOG_TRUSTED_PROXIES`). O limitador de falhas de assinatura por IP usa esse valor. **Se a chamada da Kapso não passar pela Cloudflare** (não deve: o domínio está proxied), todas as falhas apareceriam como um só IP; confirme no log da primeira chamada.
- O webhook é `POST` sem cookie, sem `Origin` e sem JWT, com cadeia própria: variantes (`GET`, `HEAD`, `OPTIONS`, barra final, `;jsessionid`) são negadas.

Na Cloudflare (painel, sem Terraform):
1. **Regra de rate limiting** para `POST /v1/integrations/whatsapp/webhook`: sugestão de 300 requisições por minuto por IP (a Kapso reentrega em rajada, ajuste pelo G0 item 6); ação "Block" por 1 minuto. Isso é a defesa de custo; o limite do backend (120 falhas de assinatura em 5 min) é a segunda camada e só conta as inválidas.
2. **Isente esse caminho** de desafios que quebram chamada de máquina (Managed Challenge, Bot Fight Mode, "I'm Under Attack"): crie uma regra de configuração/WAF "skip" só para esse caminho e método. Sem isso a Kapso recebe `403`/`5xx` e o webhook "nunca chega".
3. Se o G0 item 6 revelar **IP fixo** da Kapso, adicione regra "Allow" por IP + bloqueio dos demais para esse caminho; sem IP fixo, a assinatura HMAC é o controle.
4. Authenticated Origin Pulls, se ligado, é entre Cloudflare e a origem: não afeta a Kapso.

**Alerta de abuso:** `WHATSAPP_SIGNATURE_BURST` dispara push ao dono quando um IP passa do limite de assinaturas inválidas.

## 9. Janela de 24 h e templates (T10b entregue, DESLIGADA e NAO VALIDADA)

- Dentro de 24 h da última mensagem do usuário, o Monelog responde com texto livre. Fora disso a Meta só aceita **template aprovado**. **Nunca** sai texto livre fora da janela.
- **Padrão (`WHATSAPP_TEMPLATES_ENABLED=false`):** fora da janela, aviso e resumo semanal viram `SKIPPED(NO_WINDOW)`; o alerta de segurança não sai por WhatsApp (só push). Não é reavaliado no mesmo dia nem no seguinte.
- **Ligada:** fora da janela, com template configurado para o tipo, sai o template por `POST {base}/{phone_number_id}/messages` (`type=template`, `name`, `language.code=pt_BR`, `components[body].parameters` com `parameter_name`). Sem template para o tipo: `SKIPPED(NO_TEMPLATE)`. Template rejeitado pela Meta (não aprovado, inexistente, parâmetros errados): `FAILED(REJECTED)`, sem texto livre e sem reenvio. Resposta ambígua (timeout, 5xx): `FAILED`, sem reenvio. As regras da T10a valem igual: `paused`, preferência, silêncio (07:00), teto diário (`DAILY_LIMIT`) e, para segurança, 1 por tipo por hora e 3 por dia; segurança ignora `paused` e o silêncio.
- Erro de texto livre "fora da janela" (código `131047`, **inferido**): só com a flag ligada vira `SKIPPED(NO_WINDOW)`, sem template automático e sem reenvio; desligada, segue `FAILED(REJECTED)` como na T10a. Parâmetros ilegíveis com `includeAmounts=true` viram `SKIPPED(NO_TEMPLATE_PARAMS)`; o `nome` é normalizado (máximo 60 caracteres).
- **Variáveis** (todas vazias/falsas por padrão, em `docker-compose.prod.yml` e `.env.example`): `WHATSAPP_TEMPLATES_ENABLED`, `WHATSAPP_TEMPLATE_LANGUAGE` (`pt_BR`), e um nome por tipo: `WHATSAPP_TEMPLATE_INVOICE_DUE`, `_DEBT_PAYABLE_DUE`, `_RECURRENCE_PENDING`, `_WEEKLY_SUMMARY`, `_NEW_LOGIN`, `_QUICK_TOKEN_CREATED`, `_PASSWORD_RESET`. Vazio = sem template para o tipo. A partida **falha** (só com a flag ligada) se: `WHATSAPP_ENABLED=false`, nenhum nome configurado, nome fora de `[a-z0-9_]{1,64}`, o mesmo nome em dois tipos ou idioma inválido.
- **Parâmetros nomeados enviados (inferência, NAO VALIDADO):** fatura, dívida e recorrência: `nome` (omitido se vazio), `valor` (`R$ 1.283,40`), `vencimento` (`26/10/2026`); resumo semanal: `periodo` (`de 05/10 a 11/10`), `gastos`, `recebido` (semana vazia envia `R$ 0,00`); segurança: nenhum. Com `includeAmounts=false` **nenhum parâmetro** é enviado (se o template declara variáveis, a Meta rejeita e a linha fica `FAILED`; decisão de Produto pendente: um template genérico por tipo). Os templates devem ser criados com exatamente esses nomes de variável.
- **Antes de ligar `WHATSAPP_TEMPLATES_ENABLED`:** concluir o G0 itens 3 (templates `UTILITY` aprovados) e 4 (erro real fora da janela e do template rejeitado), conferir os códigos `131047` e `132001` e registrar o resultado no ADR-035 seção 30. Hoje tudo isso é inferência.

## 10. Agendador: `spring.task.scheduling.pool.size`

- O `application.yaml` **não define** o pool do agendador; o padrão do Spring Boot é **1 thread**. Todos os `@Scheduled` (notificações, `WhatsAppDispatchJob`, `WhatsAppEventRecoveryJob` a cada minuto, `WhatsAppRetentionJob`, backup, retenção de IA, metas, convites, refresh tokens) disputam essa thread.
- O despachante envia por HTTP (conexão 3 s, leitura 8 s, uma retentativa) por candidato; com a Kapso lenta, um lote atrasa os outros jobs do mesmo cron e o job de recuperação de eventos (que reabre eventos parados e marca `PENDING` preso como `STUCK`).
- **Recomendação:** `SPRING_TASK_SCHEDULING_POOL_SIZE=3` antes de ligar `WHATSAPP_DISPATCH_ENABLED`. O `docker-compose.prod.yml` repassa a variável com padrão `1` (comportamento atual). **Na AWS** a variável de ambiente `SPRING_TASK_SCHEDULING_POOL_SIZE` não chega pelo SSM (o `configtree` usa o nome do arquivo como nome da propriedade e esse nome em maiúsculas com `_` não se liga à propriedade). **Inferência a testar, sem mudar código:** o `application-prod.yaml` importa `optional:configtree:${SECRETS_DIR:/run/secrets}/`, o `deploy.sh` grava um arquivo por parâmetro do prefixo com `basename` do nome, e o SSM aceita `.` no nome do parâmetro. Logo um parâmetro `/moneylog/prod/spring.task.scheduling.pool.size` com valor `3` deveria virar a propriedade `spring.task.scheduling.pool.size`. Teste em ambiente de teste (ou com o dispatch ainda desligado): crie o parâmetro, faça deploy e confirme o efeito (por exemplo, o nome das threads `scheduling-N` nos logs, que o ECS JSON registra em `process.thread.name`). Se não funcionar, restam as duas mudanças que dependem de aprovação do dono: `environment` no compose gerado em `infra/terraform/user_data.sh.tftpl`, ou `spring.task.scheduling.pool.size: 3` no `application-prod.yaml`.

## 11. Logs e o logger do Hibernate (HHH000247)

- O código do Monelog não registra telefone, corpo de mensagem, áudio, transcrição, chave ou segredo (há teste de log). Resposta de erro `5xx` não carrega causa.
- **Exceção conhecida (QA da T9a):** o logger `org.hibernate.engine.jdbc.spi.SqlExceptionHelper` imprime `HHH000247: ErrorCode..., SQLState...` com a **mensagem do PostgreSQL**. Em violação de unicidade o `Detail` traz os valores da linha (por exemplo o `phone_hmac`). Recomendação para produção: nível `OFF` ou `ERROR` para esse logger (`logging.level.org.hibernate.engine.jdbc.spi.SqlExceptionHelper`). Hoje **nada** o configura; o `application-prod.yaml` não o define. No `docker-compose.prod.yml` basta adicionar `LOGGING_LEVEL_ORG_HIBERNATE_ENGINE_JDBC_SPI_SQLEXCEPTIONHELPER: "OFF"`. **Na AWS, inferência a testar (mesmo mecanismo da seção 10):** um parâmetro SSM `/moneylog/prod/logging.level.org.hibernate.engine.jdbc.spi.SqlExceptionHelper` com valor `OFF` provavelmente vira a propriedade pelo `configtree`; confirme provocando uma violação de unicidade em ambiente de teste e vendo que o `HHH000247` não aparece. **Pré-requisito para ligar `WHATSAPP_ENABLED`**, não só pendência: sem isso o `Detail` do PostgreSQL (com valores de linha, como `phone_hmac`) pode ir ao CloudWatch.
- Os logs do contêiner vão ao CloudWatch (14 dias na AWS): trate-os como dado interno.

## 12. LGPD

- **Consentimento:** versão 1 (texto proposto no ADR-035 seção 11) é gravada no vínculo com a data. Vínculo sem o texto vigente não processa áudio. **O texto final é do dono (Q24)** e é portão de liberação.
- **Base legal (proposta, não é parecer jurídico):** consentimento do titular (LGPD art. 7, I) e, para a transferência internacional, consentimento específico e destacado (art. 33, VIII). Kapso, Meta e OpenAI são **operadores** (art. 5, VII); o Monelog/dono é o controlador. Revise com assessoria jurídica antes de convidar terceiros.
- **DPA:** obter e arquivar fora do repositório os termos de tratamento de dados da **Kapso e da Meta** (G0 item 5) e da **OpenAI** (G0 item 9): papel de operador, subprocessadores, local de tratamento, retenção, prazo e canal para apagamento. Sem os três o canal fica no número de teste.
- **Retenção no Monelog:** sem corpo de mensagem (guarda hash, tamanho, intenção, resultado, 90 dias); áudio e transcrição **nunca** são gravados (memória durante a chamada).
- **Retenção fora do Monelog:** o histórico e os áudios ficam na Kapso e na conversa do WhatsApp do usuário (inclusive tela de bloqueio e backup do aparelho) até serem apagados. Ver seção 5 para apagar.
- **Risco aceito pelo dono:** valores, saldos e descrições trafegam por Kapso e Meta e ficam na conversa; SIM swap dá a quem clona o número acesso às respostas e lançamento sem teto por padrão (estornável pelo app). Mitigações: `includeAmounts` desligável, apagar ao revogar, consentimento versionado.

### OpenAI: `store=false` não é retenção zero

- O adaptador envia `store=false` no texto, mas **não existe cabeçalho por requisição que garanta retenção zero**. A retenção de logs de abuso (padrão da OpenAI, cerca de 30 dias) e o "zero data retention" são **contrato/configuração da organização** da chave; o uso para treino fora do padrão da API também. O endpoint de transcrição não tem `store`.
- Portanto: **`AI_PROVIDER=none` até o G0 item 9** (termos vigentes, preço, se o dono pede ZDR). O consentimento v1 já cita a OpenAI.

## 13. Observabilidade e alertas

Os logs são JSON (ECS) e sem dado pessoal. O que acompanhar:

| Sinal | Onde | Ação |
|---|---|---|
| Webhook recusando `401` em volume | push `WHATSAPP_SIGNATURE_BURST`; log do Caddy (status 401 em `/v1/integrations/whatsapp/webhook`) | Segredo trocado sem alinhar com a Kapso, ou ataque. Veja seção 6/8. |
| Eventos `DROPPED`/`FAILED` | tabela `whatsapp_webhook_events` (`status`, `failure_code`) | `QUEUE_FULL`: aumentar `WHATSAPP_WEBHOOK_QUEUE_SIZE`; `MAX_ATTEMPTS`: ver log do manipulador. |
| Envios `FAILED` | `whatsapp_outbound` (`status`, `reason`: `REJECTED`, `AMBIGUOUS`, `STUCK`, `HTTP_4xx`) | Muitos `HTTP_4xx` desde o primeiro envio = inferência do cliente errada (G0 item 4): base, rota ou `X-API-Key`. |
| Alerta de segurança descartado | log `whatsapp_dropped` (`QUEUE_FULL`, `rollback`) | Fila `WHATSAPP_SECURITY_QUEUE_SIZE` cheia ou Kapso lenta. |
| **Chave da OpenAI revogada ou sem permissão** | **sem alerta automático** | `401`/`403` são definitivos e **não abrem o circuito** do `AiGuard`: cada texto ou áudio faz uma chamada inútil e consome 1 da cota diária de 50, e o usuário vê "indisponível". Detecte por: (a) o painel da OpenAI (uso zero e erros de autenticação); (b) `SELECT status, count(*) FROM ai_analyses WHERE created_at > now() - interval '1 day' GROUP BY 1;` com `FAILED` dominando; (c) o usuário reclamar. Ao revogar uma chave de propósito, troque no SSM primeiro. Alerta ao dono é pendência (seção 16). `insufficient_quota` costuma vir como `429` (transitório; abre o circuito após 5 falhas seguidas). |
| Custo | painel da OpenAI e da Kapso | `AI_MONTHLY_AUDIO_SECONDS` e `AI_DAILY_CALL_LIMIT` (compartilhado entre texto, análises e áudio) limitam o gasto do app. |
| Saúde | `/actuator/health` | Só `{"status":"UP"}`. |

## 14. Limitações operacionais conhecidas

- **Instância única** (ADR-003): limites de rajada em memória (3 inícios de vínculo por hora, rate limit do webhook, throttle de push) viram N vezes com N instâncias e zeram no reinício. Os limites de alerta de segurança por WhatsApp (1 por tipo por hora, 3 por dia) são duráveis no banco.
- Silêncio (22:00 a 07:00 padrão), dia e teto usam `America/Sao_Paulo`, não o fuso do usuário.
- Aviso gerado entre 22:00 e 23:59 morre em silêncio (só o mesmo dia é reavaliado). Resumo semanal é gerado no domingo a partir das 19:00; perder o domingo perde a semana.

## 15. Teste de fumaça com o número de teste

1. `WHATSAPP_ENABLED=true`, dispatch e IA desligados. No app, inicie o vínculo e envie `VINCULAR <código>` do telefone de teste: vinculado.
2. `mercado 35,50`: um gasto de R$ 35,50, resposta com valor, categoria, conta, descrição e saldo. Reenvie o mesmo evento da Kapso: nada duplica.
3. `mercado 1.234`: nada gravado e pede vírgula; `fatura nubank 1283`, `transferi 1000 xp`: nada gravado, orienta o app (integridade financeira, PR 01).
4. `PARAR` e `RETOMAR`: confirmam e alternam `paused`.
5. Assinatura inválida: `401`; corpo acima de 64 KB: `413`.
6. Revogue o vínculo no app e confirme o apagamento da conversa e do contato na Kapso (seção 5).

## 16. Decisões de Produto e do dono pendentes

1. Texto final do consentimento (Q24), base legal e DPA de Kapso, Meta e OpenAI.
2. G0 itens 1 a 9 e o resultado de cada inferência do cliente da T3 e da T10b (ADR-035 seção 30).
3. `PARAR` hoje pausa só os avisos proativos (lançar e consultar seguem); decidir se deve bloquear tudo, e o vocabulário de opt-out (`SAIR`, `PARE`).
4. `LOGIN_BLOCKED` ficou fora do WhatsApp (vetor de spam ao número da vítima); manter ou voltar limitado a IP novo. Limites de segurança de 1 por tipo/hora e 3/dia são provisórios.
5. `includeAmounts=false` omite também o nome (cartão, dívida, recorrência).
6. `NO_WINDOW` no primeiro ciclo versus esperar a janela do dia; aviso entre 22:00 e 23:59.
7. Resumo semanal: domingo 19:00 versus segunda cedo; categorias fora; gerado para todos na central; chave de i18n no front.
8. Transcrição de áudio não passa pela IA de texto (só pelo interpretador determinístico); cota de 50 chamadas/dia compartilhada; áudio AAC/AMR.
9. Validar (parâmetro SSM com o nome da propriedade) ou aprovar a mudança de código para `pool.size` do agendador e do nível do logger `SqlExceptionHelper` em produção (seções 10 e 11) e o alerta de chave da OpenAI revogada.
10. Custo por mensagem iniciada, plano da Kapso e limites (Q9), e política de retenção/apagamento do painel (Q25).
11. Templates (T10b): com `includeAmounts=false`, enviar template sem variáveis (adotado, pode ser rejeitado pela Meta) ou um template genérico por tipo; semana vazia envia `R$ 0,00`; segurança por template ignora `paused` e silêncio como a T10a; sem template configurado a linha é `NO_TEMPLATE` e não é reavaliada.
