---
tags: [moneylog, adr, backend, notificacoes, push]
status: aceito
data: 2026-10-07
task: T127 a T130 (Etapa 7)
relacionado: ADR-001
---

# ADR-012: central de notificações garantida, geração idempotente e push atrás de `PushSender`

(O plano da Etapa 7 cita "ADR-008" para este tema; o número 008 já é da leitura do razão. Este é o registro.)

## Decisão

1. **A central dentro do app é o canal garantido.** Notificações, lembretes e a mensagem diária funcionam sem push, sem HTTPS real e sem chaves.
2. **Texto = chave de i18n + parâmetros** (`titleKey`, `bodyKey`, `params`). O backend não grava frase pronta; o front traduz e formata (S-34). A mensagem diária (`GET /v1/daily-message`) segue a mesma regra e usa as **mesmas fontes** do dashboard (`FinancialRecords`, `CommitmentSchedule`, `DashboardSummary`): nenhum segundo caminho de cálculo (PR 01, regra 10).
3. **Geração idempotente por job** (`@Scheduled`, a cada 15 min, `America/Sao_Paulo`, uma instância). A chave única é `(user_id, kind, ref_id, on_date)` (índice único `V7.02`); `ref_id` nunca é nulo (nos tipos sem entidade usa o `user_id`), porque no Postgres NULLs não colidem em índice único. Rodar duas vezes, reiniciar o app ou ter duas instâncias não duplica (`INSERT ... ON CONFLICT DO NOTHING`). Falha de um usuário não derruba os outros e o log não leva dados.
4. **Sem spam (S-175):** no máximo uma por `(tipo, referência, dia)` e **5 por dia**; as excedentes viram uma notificação agrupada `GROUPED` ("N lembretes"). Atrasadas aparecem no 1º dia e depois a cada 7 dias. Tipos configuráveis, resumo diário com `DAILY | ONLY_DUE | OFF` e horário, janela de silêncio (22:00 a 07:00) que tira só o push, nunca a central.
5. **Retenção (S-179):** lidas há mais de 90 dias viram `archived` e saem da central; **nada é apagado**.
6. **Push preparado e desligado.** Porta `PushSender`; `NoopPushSender` por padrão; `WebPushSender` (JDK puro: ECDH P-256, HKDF e AES-128-GCM da RFC 8291 mais JWT VAPID ES256 da RFC 8292, validado contra o vetor da RFC) só com `moneylog.push.enabled=true`. Com `enabled=true` e sem `MONEYLOG_PUSH_VAPID_PUBLIC/PRIVATE/SUBJECT` o **app não sobe**. Payload com `id`, `kind`, `titleKey` e parâmetros sem valores financeiros (`push.include-amounts=false`). `404/410` remove a assinatura; `429/5xx` recuam. Máximo de 10 assinaturas por usuário; `endpoint` repetido é a mesma assinatura. Push desligado: `422 PUSH_NOT_ENABLED` na assinatura e `GET /v1/push/config` com `enabled: false`.
7. **Assinar liga o push da conta (adendo de 2026-10-18).** `POST /v1/push/subscriptions` liga `notification_settings.push_enabled` na mesma transação da assinatura, inclusive na reassinatura de endpoint conhecido, e cria a linha de configurações com os padrões se ela não existir. A operação (`setPushEnabled`) é um SQL atômico que só incrementa `version` quando o valor realmente muda; assim uma tela de Configurações aberta com a versão anterior recebe `409` ao salvar em vez de desligar o push em silêncio, e reassinar com o push já ligado não gera conflito espúrio. A UI não tem o toggle `settings.push` (o push é decidido por assinar o aparelho). Remover o último aparelho **não** desliga o flag: sem aparelhos o envio não acha destino, o que é inofensivo; a regra de desligar automaticamente segue em aberto com o dono. A migração `V9.26` religa quem já tinha assinatura antes da correção.

## Alternativas recusadas

- E-mail e SMS (fora do MVP; dependem de provedor e expõem dado financeiro fora do app).
- Biblioteca Web Push de terceiros: o fluxo cabe em ~150 linhas de JDK, evita dependência nova (e BouncyCastle) e tem teste com o vetor oficial.
- Gerar notificação na leitura (sem job): o contador de não lidas ficaria dependente de abrir a tela e a geração seria concorrente.

## Não exercitado (precisa de terceiros)

Envio real a um iPhone/Android, domínio HTTPS, chaves VAPID e PWA instalada (iOS 16.4+). Roteiro: gerar o par VAPID, definir as três variáveis, ligar `moneylog.push.enabled`, instalar a PWA, conceder a permissão por gesto e assinar em `POST /v1/push/subscriptions`.

## Adendo (2026-10-21): mensagem pronta em `POST /v1/quick-entries` (ADR-034)

A decisão 2 ("o backend não grava frase pronta; o front traduz e formata") tem **uma exceção**, restrita a `POST /v1/quick-entries`: o Atalho do iPhone não traduz código de erro e não tem i18n, então o `201` traz `message` e os erros trazem `detail` em português pronto para a notificação do iOS. O `message` usa apenas valor formatado pelo backend e nomes já gravados (categoria e conta) e **nunca ecoa `description` nem texto livre digitado**, porque a notificação aparece na tela de bloqueio. A regra de i18n por chave continua valendo para a central de notificações, o push e todas as demais rotas.

