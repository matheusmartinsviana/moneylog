# Revisão de código: Etapa 3, frontend (T62 a T71)

Revisor: agente `revisor` · 2026-10-06 · Escopo: `frontend/` (módulo `cards`, telas `cards/*`, `quick-add` Crédito, detalhe de movimentação com parcelas e cancelamento, Início com cartões). Só leitura; nada foi corrigido nem commitado. O E2E de integração não foi executado (backend da Etapa 4 em andamento).

Verificações rodadas: `lint:deps` verde (376 módulos, sem violação), `check-native-controls` verde, `check-styles` verde, `ng lint` verde, `check-contrast` verde (38 pares), `typecheck` verde, `npm test` 99 arquivos / 1145 testes verdes (cobertura 95% linhas). `api:check` **falha**, mas por causa do `contracts/openapi.yaml` que o dev-backend da Etapa 4 está alterando agora (`DebtEntry`, `debtItems`, `debtConsumption`, descrição de `from` em recorrências); nada a ver com a Etapa 3. Precisa rodar `npm run api:types` quando a Etapa 4 fechar o contrato.

## 1. Resumo

O front da Etapa 3 está bem construído e respeita o princípio central: nenhuma conta financeira no cliente. Camadas, guarda de controles nativos, i18n, estados de tela e testes estão sólidos. Os problemas reais estão na **robustez do pagamento de fatura** (chave de idempotência nova em reenvio após falha ambígua) e em um alvo de pagamento que pode ser a fatura errada enquanto a lista carrega. Há ainda um acoplamento do `/quick-add` com o endpoint de cartões que vale corrigir.

## 2. Itens conformes

- **O front não calcula nada financeiro.** Varredura de `Number(`, `parseFloat`, `Math.`, `toFixed`, `* 100`, `reduce` sobre valor, ordenação por valor: nada. Os únicos `reduce` concatenam páginas (`cards-list.facade.ts:86`, `card-detail.facade.ts:162`); os únicos `sort` ordenam por **data** (`card.page.ts:116`, `invoice-items-table.component.ts:137`). `Money` é `{amount: string}` do mapper à tela; `usedRatio` vem pronto e só vira largura (`progress-bar`). `totalCommitted` e `committedFuture` ficam em linhas separadas e nunca somados (`card-header`, `cards-summary`, teste do Início afirma que "2.283,00" não aparece). Prévias (compra, pagamento, mudança de dias) exibem o que veio; há testes com resposta falsa que não bate com a conta.
- **UI própria.** Telas novas só usam `Select`, `DatePicker`, `NumberStepper`, `MoneyInput`, `Sheet`, `Tabs`, `Menu`, `ConfirmDialog`, `Disclosure`, `ProgressBar`. Nenhum `title`, `<select>`, `type=date|number|checkbox|radio`, `confirm()`, `<details>` nos arquivos da etapa. A guarda `check-native-controls.mjs` usa a AST do Angular e do TS (não regex), cobre tags, `type` dinâmico, `title`, diálogos, `showPicker`, CSS nativo e é testada; está no `npm run lint`.
- **Segurança.** Nenhum campo de número, validade ou CVV (formulário tem texto de privacidade); a facade do formulário documenta que o contrato não os tem. `Idempotency-Key` no `POST /invoices/{id}/payments` e no `POST /transactions` (únicas escritas que o contrato exige; `PUT /cards`, `cancel-installments`, `void`, `archive` não têm a chave no contrato e `PUT` é protegido por `version`). `exhaustMap` em pagamento, formulário de cartão, estorno e cancelamento (clique duplo = uma requisição). `returnUrl` continua só no fluxo de auth (Etapa 1), sem uso novo.
- **Erros.** Todos os códigos novos do backend (`CARD_*`, `INVOICE_*`, `TRANSACTION_IN_CLOSED_INVOICE`, `CONFLICT`, `CARD_BILLING_CHANGE_STALE`, `VERSION_CONFLICT`, `MONEY_*`) existem em pt, en e es (conferido contra os literais do backend). 409 `VERSION_CONFLICT` recarrega; `CARD_BILLING_CHANGE_STALE` refaz a prévia; `CONFLICT` oferece "tentar de novo" com a mesma chave (FE-S-140). Não há texto no Title Case nos blocos `cards`.
- **Corrida prévia x envio.** `DebouncedPreview.request()` marca `loading` na hora, então `data()` fica `null` até chegar a prévia da combinação atual; o salvar do cartão fica desabilitado (`waitingPreview`) e `confirmedEffectiveFrom` sai sempre da prévia da combinação vigente. Sem prévia velha na tela. `switchMap` cancela a resposta anterior.
- **Camadas.** `modules/cards` com `core`/`infra`/`mock-data`, tipos gerados só em `infra/responses`, HTTP só em `CardsRequestsFacade`, mock sem rede (`API_MOCKS`). FE-S-133 é razoável (a regra `modules-isolated` impede o módulo `invoices` separado sem duplicar tipos).
- **Estados e a11y.** Carregando, vazio, erro com "tentar de novo", não encontrado e sucesso existem em lista, cartão, fatura, formulário, pagamento e Início (cartões carregam à parte; falha não derruba o Início, FE-S-141). Status de fatura e parcela sempre com texto; `lateEntry` com explicação visível (FE-S-135); botão arquivar com `aria-disabled` e `aria-describedby`.
- **Testes.** Cobrem os critérios (chave reutilizada no retry, clique duplo, debounce, `switchMap`, valores do backend sem soma, Esc, foco, axe). Sem tautologia relevante nas facades de pagamento e prévias.
- **Desvios FE-S-133 a FE-S-142.** Todos razoáveis. FE-S-134 (`role="progressbar"` em vez de `meter`) é correto porque a guarda proíbe `<meter>`; FE-S-137 (sem "vence em N dias") evita relógio local; FE-S-136 (alvo do "Pagar") é escolha só por status e data, sem conta (ver achado A2 sobre o carregamento).

## 3. Achados

### 🟠 A1 · Reenvio do pagamento após falha ambígua gera nova `Idempotency-Key` (risco de pagar duas vezes)

- `frontend/src/app/features/cards/components/pay-invoice-sheet/pay-invoice-sheet.component.ts:178-186` (`onSubmit`), `frontend/src/modules/cards/core/facades/invoice-payment.facade.ts:88-92` (`pay` sempre gera chave nova), `pay-invoice-sheet.component.ts:145` (`dismissProblem()` ao reabrir) e `pay-invoice-sheet.component.html:56-79` (os botões "Tentar de novo" e "Pagar" aparecem lado a lado).
- **Problema:** depois de um erro de rede ou 5xx (o servidor pode ter gravado e a resposta se perdeu), o botão principal "Pagar" continua ativo e gera chave **nova**. O mesmo vale ao fechar e reabrir a folha (`dismissProblem` zera `last`). A idempotência só protege quem usa "Tentar de novo". É o mesmo padrão registrado na revisão da Etapa 2 (linha 175), mas aqui move dinheiro de uma conta para uma fatura.
- **Impacto:** pagamento duplicado de fatura (saída de caixa em dobro), exatamente o que a chave existe para evitar.
- **Correção:** em falha retryable (`status 0`, `>= 500`, `CONFLICT`), manter `last` e fazer `pay()` reaproveitar a chave quando `invoiceId` e `input` forem iguais aos da tentativa pendente (ou esconder "Pagar" e deixar só "Tentar de novo" enquanto a falha for ambígua). Não zerar `last` ao reabrir a folha se a falha foi retryable e a fatura é a mesma. Aplicar o mesmo cuidado em `TransactionFormFacade.submit` para a compra no cartão (`modules/transactions/core/facades/transaction-form.facade.ts`, `submit`). Teste: erro de rede, "Pagar" de novo sem editar, esperar a mesma chave.

### 🟠 A2 · "Pagar fatura" pode abrir a fatura errada enquanto as faturas carregam ou se a lista falha

- `frontend/src/app/features/cards/pages/card.page.ts:105-119` (`payTarget`), `card.page.html:15-23` e `card.page.ts:125` (item do menu).
- **Problema:** `const known = list.status === 'ready' ? list.data : []`. Com a lista de faturas ainda carregando ou em erro, o alvo cai em `card.currentInvoice` (`OPEN`) quando há saldo. Se existe uma fatura `CLOSED` ou `OVERDUE` mais antiga com saldo, o usuário paga a corrente (pagamento antecipado) achando que quita a vencida; o título da folha mostra o mês, mas o botão está habilitado sem aviso.
- **Impacto:** pagamento na fatura errada, com a vencida seguindo em aberto. O backend aceita (qualquer valor > 0).
- **Correção:** `payTarget` só decide quando `invoices().status === 'ready'`; antes disso devolver `null` com a dica "carregando as faturas" (e, em erro da lista, "tentar de novo" em vez de cair na corrente). Teste: faturas pendentes + corrente com saldo, "Pagar" desabilitado até a lista chegar.

### 🟠 A3 · `/quick-add` carrega cartões em todos os modos e uma falha deles derruba o registro de despesa

- `frontend/src/app/features/quick-add/form-options.ts:30-35` (`forkJoin` com `cards.loadAll('ACTIVE')`), `quick-add.page.ts` (`reload`), `frontend/e2e/integration/states.e2e.ts:24`.
- **Problema:** o `forkJoin` junta contas, cartões e categorias para **todos** os modos. Um erro em `GET /v1/cards` (ou nas contas) leva a tela inteira ao estado de erro, inclusive despesa, Pix e receita, que não usam cartão. Além disso cada abertura do `/quick-add` faz uma paginação de cartões que só Crédito e Reembolso usam.
- **Sobre o `duplicateOk.push('/v1/cards')` (item 6):** a "duplicidade" é real no sentido mecânico, mas **não é um bug do usuário**: quando contas falha, o `forkJoin` cancela o `GET /v1/cards` em voo, e o "tentar de novo" o repete. Não há dois pedidos vivos para a mesma tela, e a requisição cancelada aparece como "em voo" no detector do `fixtures.ts`. O comentário do teste explica isso corretamente. O que o teste mascara é o **acoplamento** acima, e `duplicateOk` com o prefixo `/v1/cards` vale para o arquivo todo (esconde duplicidade real de cartões nos demais cenários).
- **Impacto:** o fluxo mais valioso do produto (registrar em segundos) passa a depender de um endpoint novo; maior latência de abertura.
- **Correção:** carregar cartões só quando o modo for `credit` ou `refund` (ou tolerar falha: `catchError(() => of([]))` com aviso só nesses modos); depois remover o `duplicateOk` global e restringir à janela do teste (por exemplo limpar a lista depois do passo).

### 🟡 A4 · Prévia da compra é refeita a cada tecla na descrição, na categoria e nas observações

- `frontend/src/app/features/quick-add/components/card-purchase-form/card-purchase-form.component.ts:147` (`this.form.valueChanges...emitPreview()`).
- **Problema:** `valueChanges` do grupo inteiro dispara `previewRequest` mesmo quando só mudou `description`, `categoryId` ou `notes`. `DebouncedPreview.request` põe `loading` na hora, então o painel pisca "calculando" e vem um `POST purchase-preview` a cada pausa de digitação, sem que valor, parcelas, data ou cartão tenham mudado.
- **Impacto:** requisições desnecessárias e salto de layout no celular (o botão salvar precisa ficar visível, T67 CA6); não afeta correção dos números.
- **Correção:** emitir só quando a combinação `(cardId, amount, date, installments)` mudar (`distinctUntilChanged` por chave, ou assinar só esses quatro controles).

### 🟡 A5 · Prévia de mudança de dias com erro não tem "tentar de novo"

- `frontend/src/app/features/cards/components/billing-change-notice/billing-change-notice.component.ts` (estado de erro) e `card-form.page.html:111-128`.
- **Problema:** em falha de rede/5xx da prévia, `data()` fica `null` e o salvar fica desabilitado; o único jeito de repetir é mexer num dia e voltar. A mensagem diz que não foi possível calcular, sem ação.
- **Correção:** botão "Tentar de novo" que chame `updateBillingPreview()`.

### 🟡 A6 · `LiveAnnouncer` (flaky): ordem de anúncios invertida por temporizador pendente

- `frontend/src/app/common/components/overlay/live-announcer.service.ts:26`.
- **Problema:** quando a região é movida para dentro do modal, o texto é escrito num `setTimeout(50)` sem guardar o handle. Dois anúncios em menos de 50 ms: o segundo (região já movida) escreve na hora e o temporizador do primeiro **sobrescreve depois** com a mensagem mais antiga. Em testes com timers reais, o mesmo temporizador sobrevive ao `replaceChildren()` do `afterEach` e escreve na região do teste anterior. Essa corrida é a causa mais provável da instabilidade e é um bug real (anúncio velho vence o novo), embora pequeno.
- **Correção:** guardar o handle e `clearTimeout` antes de cada `announce`, ou guardar o último texto e escrever só ele no temporizador; limpar o temporizador no teardown. Não pertence à Etapa 3 (vem da etapa UI própria).

### 🟢 A7 · Detalhes menores

- `PayInvoiceSheet` abre com `amount = outstanding` mesmo quando é `0.00` (fatura aberta sem saldo, pela página da fatura); o envio volta `TRANSACTION_AMOUNT_NOT_POSITIVE` no campo. Melhor desabilitar "Pagar" na página da fatura quando `outstanding` não for positivo (a regra já existe em `card.page.ts` via `isPositive`).
- `scheduled` ("pagamento agendado") compara com `todayIso()` do aparelho; é só aviso informativo, aceitável, mas diferente do relógio do servidor perto da meia-noite.
- Em `quick-add.page.html`, sem nenhuma conta ativa o modo Reembolso mostra o vazio de "sem conta" mesmo podendo reembolsar no cartão.
- `PUT /v1/cards/{id}` e `cancel-installments` sem `Idempotency-Key`: correto pelo contrato; o repetir após timeout vira `409 VERSION_CONFLICT` (seguro, mensagem pouco precisa) e o cancelamento repetido vira `CARD_NO_INSTALLMENTS_TO_CANCEL`. Sem ação, só registrar.

## 4. Riscos

- A1 e A2 são os únicos que podem alterar dinheiro de verdade (duplo pagamento, pagamento na fatura errada); recomendo corrigir antes do merge e cobrir com teste.
- `api:check` vermelho até a Etapa 4 estabilizar o contrato; regenerar `schema.gen.ts` no fechamento dela.
- O E2E de integração da Etapa 3 (`e2e/integration/cards.e2e.ts`, incluindo "mesma Idempotency-Key não paga duas vezes") não foi rodado nesta revisão; fica para a QA quando o stack subir.

## 5. Pendências por dono

- **Frontend:** A1, A2, A3 (com ajuste do E2E), A4, A5, A7.
- **UX:** confirmar o texto de "tentar de novo" na prévia de mudança de dias (A5) e a mensagem de falha ambígua no pagamento ("não sabemos se foi pago: confira a fatura antes de repetir").
- **Backend:** nenhuma pendência nova; se possível, aceitar `Idempotency-Key` opcional em `PUT /cards` com mudança de dias para o retry ficar sem `409` confuso (opcional).
- **Arquitetura:** `LiveAnnouncer` (A6) entra no backlog da etapa UI própria.
- **Produto:** nenhuma.

## 6. Parecer

🟡 **Aprovado com ajustes.** A arquitetura e o princípio "o front não calcula" estão corretos e bem testados, e a UI própria está garantida pela guarda. Os achados 🟠 A1 e A2 devem ser corrigidos e testados antes do merge porque tocam o pagamento de fatura; A3 também deve entrar agora por afetar o fluxo principal do `/quick-add`. Os 🟡 e 🟢 podem seguir no backlog.
