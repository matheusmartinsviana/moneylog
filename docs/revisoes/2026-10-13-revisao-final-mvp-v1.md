# Revisão final do MVP V1 (Etapas 7 e 8 + frontend)

Data: 2026-10-13 · Escopo: código novo não versionado. Backend: `core/importing`, `core/notification`, `infra/importing`, `infra/notification`, V7.*, `QueryStringGuardFilter`, `SearchGatewayImpl`, `core/ai`, `infra/ai`, V8.00 (e `core/finance/app/imports`). Frontend: modo demo, Quick Capture, telas de importação, notificações, push e service worker. Passada única, só leitura. Nada foi executado (Docker indisponível); o SQL JDBC foi lido linha a linha.

## 1. Resumo
A base é sólida. O isolamento por usuário, a segurança de upload/OFX, a privacidade da IA e o fluxo aplicar/desfazer estão corretos. Não há 🔴. Há três 🟠: um caminho de dupla contagem de transferência na importação (PR 01), um beco sem saída com 500 quando o mesmo extrato é importado duas vezes, e um SSRF no cadastro de endpoint de push (hoje desligado por padrão, então precisa ser corrigido antes de ligar o push).

## 2. Itens conformes
- Isolamento: todo SQL de importação, notificação, IA e busca filtra por `user_id`. As FKs compostas `(id, user_id)` protegem conta e cartão do lote. Verificado leitura a leitura.
- Upload: o arquivo bruto nunca é gravado (só o SHA-256), há limite de 5 MB e 5000 linhas, XLSX/PDF são recusados e o tipo é detectado pelo conteúdo.
- OFX: sem parser XML (varredura de tags), `DOCTYPE`/`ENTITY` recusados, então não há XXE nem billion laughs. `ACCTID` nunca é lido. Moeda diferente de BRL é recusada.
- Idempotência: o upload e o aplicar têm `Idempotency-Key` com hash do pedido. O aplicar toma `FOR UPDATE` no lote e roda em transação única (tudo ou nada). O desfazer estorna uma transação por vez e devolve `PARTIALLY_UNDONE` com a lista dos bloqueados. O job de notificações é idempotente pelo índice único `(user, kind, ref_id, on_date)`.
- PR 01: pagamento de fatura nasce rejeitado; crédito de cartão não vira compra; transferência espelhada de um lançamento manual vira `POSSIBLE_DUPLICATE`; só a linha aceita vira movimentação, pelo mesmo `CreateTransactionUseCase`; parcela exige decisão (`requiresDecision`) e entra como a parcela, não a compra inteira. O unique parcial `uq_transactions_user_dedup_active` impede duplicata ativa no banco.
- IA: só agregados e nomes de categoria passam por redação, sem id, descrição, conta ou e-mail. Prévia de uso único, com validade e hash conferido (`payload` = `facts.toPayload`). `markUsed` é atômico. A chave só vai no header `x-api-key` e `toString` a mascara. O corpo de erro do provedor nunca é lido nem logado. Há aterramento numérico, guarda de custo e disjuntor. A IA não escreve no razão. O provider `none` é o padrão.
- Push: a cifra `aes128gcm` e o JWT VAPID seguem a RFC 8291/8292 (HKDF, `key_info`, delimitador `0x02`, ES256 P1363) e há teste com o vetor da RFC. O payload não leva valores por padrão (`AMOUNT_PARAMS`). O service worker usa texto genérico por `kind` e ignora payload malformado.
- `SearchGatewayImpl`: o escape do LIKE está correto (`'\\'` em Java vira `'\'` em SQL com `standard_conforming_strings`), a ordem dos placeholders confere nas cinco consultas, e Postgres 17 suporta `normalize(..., NFC)`. Depende de `unaccent` (V6.01, ok) e de estar numa transação (`setSavepoint`), o que o caso de uso `REPEATABLE_READ` garante.
- `QueryStringGuardFilter`: a lógica está correta (hex ASCII, UTF-8 estrito, `%` truncado no fim) e roda antes do Security.
- Frontend: o modo demo só entra pelo `fileReplacement` `demo-mode.ts → demo-mode.demo.ts`. Nada fora de `src/demo` o importa, e o bundle de `dist` não contém `DemoBackend`; só aparecem textos de i18n. O Quick Capture não interpreta texto e relê o saldo do backend depois de salvar (`saved`). A importação e as notificações só exibem o que a API devolve (a única conta é o percentual de progresso de upload, que é visual). Faltando chave ou parâmetro, mostra texto neutro, sem chave crua.

## 3. Achados

### 🟠 A1 · Transferência importada pode duplicar a contagem (PR 01)
`backend/src/main/java/com/moneylog/infra/importing/gateways/ExistingEntriesGatewayImpl.java:58-75`, `core/importing/domain/ImportBatchLine.java:107-117`, `core/finance/app/imports/ApplyImportBatchUseCaseImpl.java:137-141`.
- **Problema:** a perna oposta é encontrada apenas como EXPENSE/INCOME já gravados em outra conta, ou como linha pendente de outro lote. `acceptAsTransfer` cria uma TRANSFER nova no aplicar e não faz nada com essa perna. Fluxo real: o extrato A é aplicado (saída de 100 vira despesa), depois o extrato B é importado, a entrada de 100 é marcada `POSSIBLE_TRANSFER` e o usuário escolhe "transferência". Resultado: despesa de 100 em A mais uma TRANSFER A→B de 100, ou seja, saldo de A debitado duas vezes e 100 de consumo falso. O caso simétrico (A pendente e aceita como despesa, B aceita como transferência) tem o mesmo efeito.
- **Impacto:** viola a regra central do PR 01 (dupla contagem; transferência tratada como despesa).
- **Correção sugerida:** ligar a decisão à perna encontrada. Devolver em `matches` o id da perna (hoje só a duplicata usa) e, ao aplicar como transferência, estornar a despesa/receita espelhada na mesma transação (ou rejeitar a linha pendente do outro lote) e criar uma só TRANSFER. Se a regra de pareamento ainda é decisão de produto (o comentário do `TransferPairMatcher` diz "em aberto"), no mínimo bloquear `asTransfer` quando a perna já for transação ativa, com erro explícito. **Dono: Produto (regra) + Backend.** Falta teste para "A aplicado, depois B como transferência".

### 🟠 A2 · Mesmo extrato em dois lotes: 500 no aplicar e lote preso
`core/finance/app/imports/ApplyImportBatchUseCaseImpl.java:70-82`, `core/importing/domain/ImportLineReview.java:63-73`, `core/importing/app/usecase/CreateImportBatchUseCaseImpl.java:102-110`.
- **Problema:** a classificação roda só no upload e compara com transações ativas, não com linhas de outros lotes em revisão. Subir o mesmo arquivo duas vezes dá aviso `SAME_FILE`, mas todas as linhas nascem `PENDING` nos dois lotes. Aplicado o primeiro, o aplicar do segundo viola `uq_transactions_user_dedup_active`. Esse `DataIntegrityViolationException` não é traduzido (o catch só pega Business/NotFound/Conflict), então a API responde 500. A transação reverte (sem corrupção), mas o lote fica em `PENDING_REVIEW` para sempre: linha `ACCEPTED` não volta (`accept()` e `reject()` lançam transição inválida) e não existe endpoint para descartar o lote. O mesmo ocorre em upload concorrente.
- **Impacto:** usuário sem saída e 500 num fluxo comum (clicar duas vezes em "Importar"). O dado financeiro está protegido.
- **Correção sugerida:** (1) no aplicar, reclassificar as linhas aceitas sob o lock do lote contra as transações ativas e devolver 409/422 com a posição da linha, ou capturar `DuplicateKeyException` e lançar `ImportApplyFailedException`; (2) permitir `ACCEPTED → PENDING/REJECTED` enquanto o lote está em revisão (corrige também a decisão errada de A1); (3) endpoint de descartar lote pendente. **Dono: Backend.**

### 🟠 A3 · SSRF no endpoint de push
`core/notification/app/usecase/NotificationUseCasesImpl.java:389-391`, `infra/notification/push/WebPushSender.java:60-69`.
- **Problema:** o endpoint só precisa começar com `https://`. O servidor faz POST nele, com o JWT VAPID, para qualquer host, inclusive internos, de metadados e localhost. A resposta é descartada (SSRF cego), mas ainda permite varrer a rede interna e vazar o `aud`/VAPID.
- **Impacto:** exploração por qualquer usuário autenticado assim que `moneylog.push.enabled=true`. Hoje desligado por padrão, então não é bloqueio para o MVP sem push, mas **bloqueia ligar o push**.
- **Correção sugerida:** allowlist de hosts de serviços de push (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `*.push.apple.com`), recusar IP literal e porta atípica, e manter o `HttpClient` sem seguir redirecionamento. **Dono: Backend.**

### 🟡 M1 · Campos longos viram 500 no upload
`infra/importing/gateways/ImportBatchGatewayImpl.java:78-81`.
- `nz()` trunca só `description`. `normalized_description` (VARCHAR 500) é derivado da descrição completa e `fit_id` (VARCHAR 100) vem sem limite do OFX/CSV. Uma célula de descrição maior que 500 caracteres ou um `FITID` maior que 100 estoura o INSERT e vira 500.
- **Correção:** truncar a descrição normalizada e pular a linha com motivo (`skipped`) quando o FITID passar de 100, ainda no parser. **Dono: Backend.**

### 🟡 M2 · Categoria de outro usuário no `learn` vira 500
`core/importing/app/usecase/ReviewImportLinesUseCasesImpl.java:63-67`, `ImportHistoryGatewayImpl.upsertRule`.
- O `categoryId` do PATCH não é validado na revisão. Com `learn=true` a FK composta de `categorization_rules` falha (500). Sem `learn`, só falha no aplicar (e aí vira erro tratado). Não há vazamento, mas a resposta é feia e tardia.
- **Correção:** validar a categoria do usuário (e que o tipo combine com a direção) na revisão, devolvendo 404/422. **Dono: Backend.**

### 🟡 M3 · Parcela importada não é cruzada com plano parcelado existente
`core/importing/domain/LineFlagger.java:33-34`.
- `LOOKS_LIKE_INSTALLMENT` só exige decisão. Se o usuário já cadastrou a compra em N parcelas, aceitar "PARC 03/10" cria uma compra à vista a mais (dupla contagem da parcela). Não conta a compra inteira no mês, mas pode duplicar a parcela.
- **Correção:** buscar parcelas ativas do cartão com mesmo valor no mês e sinalizar como `POSSIBLE_DUPLICATE`; ou texto de alerta na tela de decisão. **Dono: Produto + Backend.**

### 🟡 M4 · Push: sessão encerrada não limpa a assinatura
`frontend/src/modules/auth/core/facades/session.facade.ts:142-157`, `frontend/src/modules/notifications/core/facades/push.facade.ts:21`.
- Logout/`clear()` não chama `unsubscribe` nem remove `moneylog.pushSubscriptionId`. Em aparelho compartilhado, o usuário A segue recebendo avisos genéricos (sem valores) depois de sair, e o usuário B herda o estado "ativado" de uma assinatura que não é dele.
- **Correção:** no logout, `DELETE` da assinatura, `unsubscribe` no dispositivo e `removeStorage`. **Dono: Frontend.**

### 🟡 M5 · Bulk e revisão ignoram o filtro de "perna oposta" ao aceitar em lote
`ReviewImportLinesUseCasesImpl.java:97-100`.
- Está correto: `requiresDecision` pula `POSSIBLE_TRANSFER`. O ponto é que esse bloqueio só existe enquanto a flag existe; combinado com A1, a única proteção contra despesa duplicada é a decisão humana. Sem ação própria; é nota para o teste de A1.

### 🟢 B1 · Chave de idempotência da IA reaproveitada com outra prévia
`core/ai/app/usecase/AiUseCasesImpl.java:208-211`: a mesma `Idempotency-Key` com outro `previewId` devolve a análise antiga sem erro. Sugerido responder 409 se `previewId` diferir.

### 🟢 B2 · Lembrete perdido se o dia passou
`core/notification/domain/NotificationGenerators.java:206`: só notifica quando `remindOn == hoje`. Lembrete criado para data passada, ou perdido por indisponibilidade do job, nunca avisa. Aceitável no MVP; documentar.

### 🟢 B3 · Despacho de push com assinaturas mistas
`NotificationUseCasesImpl.java:333`: se uma assinatura devolve `SENT` e outra `RETRY_LATER`, a notificação é marcada enviada e a segunda não é reenviada. Sem impacto financeiro.

### 🟢 B4 · Desfazer sem lock do lote
`UndoImportBatchUseCaseImpl.java:32`: dois desfazeres simultâneos não duplicam estorno (cada estorno é idempotente por status), mas o segundo pode listar transações como "bloqueadas". Cosmético.

### 🟢 B5 · Nomes de categoria vão ao provedor de IA sem redação de pessoas
`AiUseCasesImpl.java:156`: `new Redactor(List.of())`. O usuário vê a prévia e aprova, então o consentimento cobre; só não há `PESSOA A`. Aceitável.

## 4. Riscos
- **SQL JDBC não testado contra Postgres:** a leitura não achou erro de sintaxe, de ordem de parâmetro nem de cast. Os pontos de atenção são `?::text IS NULL`, `(? OR done_at IS NULL)` com boolean, `ON CONFLICT ... WHERE`, `FILTER` e `normalize(?, NFC)`. Rodar o IT de importação, notificações, IA e busca assim que o Docker voltar.
- Push cifrado e VAPID **não exercitados em dispositivo**: manter desligado até um teste real em HTTPS.
- Disjuntor da IA e `inFlight` em memória: correto para a instância única do ADR-001.
- Teto multipart de 21 MB: o arquivo de 5 MB só é recusado depois de ler até 21 MB em memória (`file.getBytes()`); aceitável, mas um teto menor no endpoint seria melhor.

## 5. Pendências por dono
- **Produto:** regra de pareamento de transferência importada (A1); aviso/regra para parcela já cadastrada (M3).
- **Backend:** A1, A2, A3, M1, M2, B1 e testes novos (A aplicado e depois B como transferência; mesmo arquivo em dois lotes; FITID e descrição longos; endpoint de push fora da allowlist).
- **Frontend:** M4 (limpar push no logout); desabilitar/explicar a ação quando o backend recusar `asTransfer`.
- **UX:** fluxo de "desfazer decisão" de linha aceita e de descartar lote pendente (A2).
- **Arquitetura:** nenhuma nova ADR; registrar a allowlist de push como decisão se for adotada.

## 6. Parecer
**🟡 Aprovado com ajustes.** Não há 🔴. A segurança de upload, o isolamento entre usuários, a privacidade da IA, a idempotência e o desfazer estão corretos, e o front não calcula nada financeiro nem leva o modo demo para produção. Antes de liberar a importação a usuários reais, corrigir **A1** (dupla contagem de transferência, que fere o PR 01) e **A2** (500 e lote preso). **A3** precisa estar resolvido antes de ligar o push (`moneylog.push.enabled=true`); com o push desligado, não bloqueia. Os 🟡 podem entrar na sequência.
