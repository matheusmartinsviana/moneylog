# Revisão de código: Etapa 4, frontend (T83 a T89)

Revisor: agente `revisor` · 2026-10-07 · Escopo: `frontend/` (módulos `people`, `debts`, `recurrences`; telas `people/*`, `debts/*`, `planning/*`; `quick-add` com Emprestar, Receber, Nova dívida e Dividir com alguém; Início com compromissos e "Realizar"). Só leitura; nada foi corrigido nem commitado. `api:types` e o E2E de integração não foram rodados (backend em correção, contrato em mudança).

Verificações rodadas: `lint:deps` verde (462 módulos, sem violação), `check-native-controls` verde, `typecheck` verde, `ng lint` verde. `npm test`: 116 arquivos verdes, **5 testes falharam** (1444 de 1449), todos com explicação de carga/isolamento (seção 3.G); os dois que são da Etapa 4 (`home-commitments` e `transaction-debt`, axe) **passam isolados** (13/13). A máquina estava com load average 17 a 32.

## 1. Resumo

O front da Etapa 4 está bem construído e respeita o princípio central: nenhuma conta financeira no cliente. A idempotência das movimentações (emprestar, receber, quitar, despesa dividida, realizar ocorrência) foi feita direito, inclusive o reuso da mesma chave no retry e ao reabrir a folha (os achados A1 e A2 da Etapa 3 foram aplicados). Os problemas reais são: (1) `POST /v1/debts` ainda não envia `Idempotency-Key`, que o contrato já aceita como opcional; (2) a lista de dívidas "me devem" do `/quick-add` fica velha depois de emprestar ou receber; (3) um "tentar de novo" morto no formulário de recorrência; (4) dois códigos novos do backend sem tradução. Nenhum 🔴.

## 2. Itens conformes

- **O front não calcula nada financeiro.** Varredura de `Number(`, `parseFloat`, `Math.`, `toFixed`, `* 100`, `reduce`, `sort`, `slice(1)` nos módulos e telas da etapa: nenhum uso sobre valor. Os `reduce` só concatenam páginas (`loadAll`); os `filter` só agrupam por `status`/`direction`/`overdue`/`bucket` vindos da API. `withoutSign` (`util/money.ts:88`) só tira o `-` do texto e é usado em um único ponto (`person-balance.ts:17`), onde o sentido já está na frase escolhida pelo `direction` do backend; é só apresentação. A divisão de despesa não soma nem confere: `SharesField` envia o valor digitado por parte e o backend valida (`SHARES_EXCEED_AMOUNT`). Totais a receber/pagar, saldo da pessoa (`net`), `outstanding`, `debtItems`, `debtConsumption` e a "Estimativa" da recorrência vêm da API; o `FixedCostsSummary` só exibe e rotula.
- **UI própria.** Nenhum `<select>`, `type=date|number|checkbox|radio`, `title`, `confirm()`, `<details>`, `alert()` nas telas novas; só `Select`, `DatePicker`, `NumberStepper`, `MoneyInput`, `SegmentedControl`, `Sheet`, `ConfirmDialog`, `Menu`, `Tabs`, `Disclosure`. `check-native-controls` verde (AST). As abas de Planejamento são links com `aria-current="page"` (FE-S-148).
- **Idempotência e retry.** `TransactionFormFacade` (emprestar, receber, quitar, despesa dividida) guarda a tentativa pendente em falha ambígua (`status 0`, `>= 500`, `CONFLICT`) e reaproveita a chave quando a entrada é igual (`JSON.stringify`), mesmo depois de `dismissProblem`, troca de modo ou reabertura da folha de quitação (`settle-sheet:122`, só descarta a falha se `!canRetry()`). `OccurrenceRealizeFacade` faz o mesmo com `reopen()` por ocorrência e deixa a folha montada. `exhaustMap` em todas as escritas (clique duplo = uma requisição). O `retry()` usa a mesma chave. Perdoar, estornar o registro, editar, encerrar, desativar e pular não têm chave no contrato e são seguros por `version` ou por natureza (repetir vira erro de regra e recarrega).
- **Estornar quitação por `POST /v1/transactions/{id}/void` (FE-S-145)**: correto, a quitação é a movimentação; após sucesso ou falha a dívida é recarregada do backend (`debt.page.ts`); `voidBlockedBy`/`voidable`/`cancelable` vêm do backend.
- **Erros.** Os códigos `PERSON_*`, `DEBT_*`, `SHARE*`, `RECURRENCE_*`, `MONEY_*` que o backend lança existem em pt, en e es (31 por idioma), conferido contra os literais do backend, exceto os dois do achado A4. 409 `VERSION_CONFLICT` recarrega (pessoa, recorrência, dívida). 404 vira estado "não encontrada". 401/refresh e `returnUrl` ficam no interceptor e no `authGuard` já revisados; as rotas novas (`/people`, `/debts`, `/planning`) estão atrás do `authGuard`.
- **S-138 (criar pessoa na hora).** Se a movimentação falha depois, a pessoa criada fica na lista e escolhida e o "tentar de novo" reaproveita o mesmo `personId` e a mesma chave: nenhuma pessoa nova por tentativa; a pessoa órfã é no máximo uma pessoa sem dívida, visível e arquivável, sem efeito financeiro. Aceitável.
- **Estados de tela.** Carregando, vazio, erro com "tentar de novo", não encontrado e sucesso existem em pessoas, pessoa, dívida, recorrências, pendentes, formulários e Início (o resumo de custo fixo carrega à parte; a falha de pessoas no `/quick-add` não derruba os demais modos).
- **Camadas.** `modules/people|debts|recurrences` com `core`/`infra`/`mock-data`, HTTP só nas `*RequestsFacade`, `lint:deps` sem violação.
- **Desvios FE-S-143 a FE-S-153.** Razoáveis, com as ressalvas em A1 (FE-S-143), A2 (FE-S-150 e a folha montada) e M1.
- **i18n/tom.** Sem Title Case em en nas strings da etapa; copy calma ("estimativa", "a receber não entra no a pagar").

## 3. Achados

### 🟠 A1 · "Nova dívida" não envia `Idempotency-Key` (o contrato já a aceita) e o retry não é seguro

- `frontend/src/modules/debts/core/facades/debt-form.facade.ts:54-62` (`save`/`retry` sem chave), `frontend/src/modules/debts/infra/facades/debts-requests.facade.ts` (`create` sem header), `frontend/src/app/features/quick-add/components/debt-entry/debt-entry.component.ts:44-47` (`canRetry` só `status 0` ou `>= 500`).
- **Problema:** `contracts/openapi.yaml:1539-1542` agora declara `Idempotency-Key` opcional em `POST /v1/debts` (S-237, o consumo com `categoryId` também duplica). O front não a gera. Depois de uma resposta perdida, o botão "Salvar" (e o "tentar de novo") reenvia o mesmo corpo sem chave: dívida duplicada e, em "Eu devo" com categoria, consumo duplicado no mês. O `canRetry` também não cobre `CONFLICT`.
- **Impacto:** duplicidade de dívida e de despesa (integridade financeira, PR 01).
- **Correção:** depois de `api:types`, gerar `newIdempotencyKey()` por tentativa em `DebtFormFacade` com o mesmo padrão de `TransactionFormFacade` (`pending` por falha ambígua, reuso para o mesmo corpo, inclusive ao trocar de modo), `canRetry` igual a `isRetryable` (status 0, >= 500, `CONFLICT`), passar a chave pelo `DebtsGateway.create`. Testes: retry reaproveita a chave; "Salvar" com o mesmo corpo depois de falha ambígua também; corpo diferente gera chave nova.

### 🟠 A2 · `/quick-add` mostra dívidas "me devem" velhas depois de emprestar ou receber

- `frontend/src/app/features/quick-add/pages/quick-add.page.ts:327-346` (`loadReceivables`, carrega uma vez), `:259-289` (nenhum recarregamento no `saved$`), `received-form.component.ts:157-165` (`clearAfterSave` só zera campos).
- **Problema:** `receivablesLoad` fica `ready` para sempre na sessão da tela. Emprestar (`LOAN_GIVEN`) cria uma dívida que **não aparece** em "Receber" até recarregar a página; receber uma devolução não atualiza o `outstanding` nem tira a dívida quitada: a dica "Falta R$ x" e o valor sugerido ficam antigos, e a próxima devolução sugere o valor já pago (o backend recusa com `DEBT_SETTLEMENT_EXCEEDS_OUTSTANDING`/`DEBT_ALREADY_SETTLED`, mas o usuário foi induzido ao erro).
- **Impacto:** fluxo principal de cobrança confuso; valor sugerido errado.
- **Correção:** no `facade.saved$`, quando `saved.type` for `LOAN_GIVEN` ou `MONEY_RECEIVED` (e quando a dívida de `saved.debt` mudar), recarregar as dívidas (`receivablesLoad.set('idle')` + `loadReceivables()`), de preferência silenciosamente. Aproveitar para passar `status` aberto ao `DebtsQuery` em vez de carregar o histórico inteiro e filtrar no cliente (ver M3). Teste: emprestar e depois abrir "Receber" lista a dívida nova.

### 🟠 A3 · Formulário de recorrência: "tentar de novo" das opções não faz nada

- `frontend/src/app/features/planning/pages/recurrence-form.page.ts:229-233` (`loadProblem`) e `:355-358` (`retryLoad`), `recurrence-form.page.html:30`.
- **Problema:** se contas, categorias ou cartões falham (`optionsProblem`), o `app-error-state` aparece, mas `retryLoad()` só recarrega a recorrência (e só com `id`). Na criação (`/planning/recurrences/new`) o botão é inerte; `optionsProblem` nunca é limpo e `loadFormOptions` não é refeito. Tela presa em erro.
- **Impacto:** o usuário não consegue criar uma recorrência depois de uma falha de rede transitória sem recarregar a página.
- **Correção:** extrair o carregamento das opções para um método `loadOptions()` (zera `optionsProblem` e `options`, refaz `loadFormOptions`) e chamá-lo no `retryLoad()` além da recorrência. Teste: falha em `GET /v1/accounts`, clicar "tentar de novo", formulário aparece.

### 🟠 A4 · `RECURRENCE_ENDED` e `RECURRENCE_INACTIVE` (backend) sem tradução e sem recarga

- Backend: `RecurrenceExceptions.java:53,60`. Front: ausentes em `frontend/src/app/common/i18n/translations/{pt,en,es}.ts`; `STALE_CODES` em `modules/recurrences/core/facades/occurrences.facade.ts:30-34` e `app/features/planning/components/realize-sheet/realize-sheet.component.ts:40-45`.
- **Problema:** realizar ou pular uma ocorrência de uma recorrência desativada ou encerrada em outro aparelho devolve `RECURRENCE_INACTIVE`/`RECURRENCE_ENDED`; o front mostra a mensagem genérica e a lista de pendentes/Início continua com a ocorrência. Os dois códigos nasceram na correção do backend, então é pendência esperada, mas precisa entrar antes do fechamento da etapa. (Pré-existentes sem tradução, menor impacto: `INVALID_DAY_OF_MONTH`, `DATE_OUT_OF_RANGE`, `TEXT_INVALID_CHARACTERS`.)
- **Correção:** adicionar os dois códigos (pt, en, es; `translations.spec.ts` já cobre paridade) e incluí-los em `STALE_CODES` das duas facades; "encerrar" uma recorrência já encerrada reabre pelo contrato novo (`RECURRENCE_ENDED`: "informe um novo endDate"): confirmar com o backend se a tela de encerrar deve tratar esse caso.

### 🟡 M1 · `POST /v1/recurrences` e `POST /v1/people` sem chave: duplicata possível sem aviso

- `recurrence-form.facade.ts:93-97`, `people-requests.facade.ts` (create), `person-field.component.ts:114-135`.
- **Problema:** FE-S-143 cobre dívidas e pessoas; recorrências têm o mesmo risco e **não estão no anexo**. Em falha de rede o formulário mostra o erro e o "Salvar" reenvia: recorrência duplicada dobra custo fixo e previsões (dentro do que o usuário vê, mas inflado) e gera duas ocorrências por mês. Pessoa duplicada é só homônimo (há aviso), baixo.
- **Correção:** pedir ao backend `Idempotency-Key` opcional também em `POST /v1/recurrences` (e `people`) e aplicar o mesmo padrão; até lá, registrar em FE-S-143 e, na falha ambígua do salvar da recorrência, orientar "confira a lista antes de tentar de novo" (UX).

### 🟡 M2 · Folha "Realizar" no Início é destruída pelo recarregamento e pela navegação

- `frontend/src/app/features/home/pages/home.page.html:143-151` (a folha está dentro do `@case ('ready')`), `home.page.ts:123-126` (`dashboard.load()` volta ao estado `loading`).
- **Problema:** FE-S-150 diz que a folha "fica montada" para guardar a chave. Isso vale só enquanto o Início não recarregar nem o usuário sair da tela; qualquer `dashboard.load()` (por exemplo "tentar de novo" do erro, ou o `(stale)`) desmonta a folha e perde a chave pendente. Depois de **sucesso** o `load()` também faz o Início piscar o esqueleto inteiro.
- **Impacto:** em falha ambígua + saída da tela, a nova tentativa gera chave nova (risco de dois lançamentos). Baixo, mas é a premissa do desvio.
- **Correção:** mover a folha para fora do `@switch` (fica sempre montada) e usar recarga silenciosa depois de realizar; ou aceitar e documentar a limitação (a chave sobrevive só na tela).

### 🟡 M3 · `loadReceivables` baixa todas as dívidas "me devem" (inclui encerradas) e filtra no cliente

- `quick-add.page.ts:327-335` (`loadAll({ direction: 'RECEIVABLE' })` + `isOpenStatus`).
- **Correção:** passar o filtro de status em aberto ao backend (`DebtsQuery.status`) e manter o `isOpenStatus` só como rede de segurança. Menos requisições para quem tem histórico.

### 🟡 M4 · Conflito de versão descarta o que o usuário digitou

- `person-form.page.ts:91-96` e `:112-118`; `recurrence-form.page.ts:289-307` e `:316-322`.
- **Problema:** em `VERSION_CONFLICT` o formulário recarrega e o `setValue`/`patchValue` sobrescreve o digitado. A banner explica, mas a edição é perdida.
- **Correção:** manter o texto digitado e só atualizar a `version` (ou mostrar "outro aparelho alterou: revise e salve de novo" com os valores do usuário). Aceitável para o MVP se o UX confirmar.

### 🟡 M5 · `DebtDetailFacade`/`PersonDetailFacade`: `refresh` silencioso que falha derruba a tela

- `debt-detail.facade.ts:68-77`, `person-detail.facade.ts:57-66`.
- **Problema:** um erro no `refresh` (depois de quitar com sucesso) troca a tela de `ready` por `error` e esconde a dívida que acabou de ser atualizada.
- **Correção:** em `silent`, manter o último `ready` e mostrar um aviso com "tentar de novo".

### 🟢 B1 · Detalhes

- Acoplamento feature-a-feature: `settle-sheet` e `debt-form` importam `TRANSACTION_CODE_TO_FIELD` e `PersonField` de `quick-add`/`people`; mover o mapa de códigos e o `person-field` para `app/common` ou `features/shared` (não quebra o `lint:deps`).
- `settle-sheet.component.ts:119-131` reabre a folha reiniciando valor e descrição; se o usuário tinha editado o valor antes de uma falha ambígua, o "Quitar" gera chave nova (o "Tentar de novo" mantém a antiga, ok). Aceitável.
- `occurrence-realize.facade.ts`: `amount === target.amount.amount` compara texto (`"150.00"` x `"150"`): só decide enviar ou não o valor; sem risco financeiro.

### G · Testes que oscilam e a falha do E2E (item 6 do pedido)

- **`ui-kit.e2e.ts › Sheet` (esperado 812, recebido 813): é teste frágil, não bug do produto.** A folha entra com `animation: overlay-sheet` (`translateY(24px)` → 0, `overlay-panel.component.ts:181,277`) e o teste lê `boundingBox()` logo que `data-side` aparece, sem esperar o fim da animação; sob carga a leitura pega o painel 1 px abaixo da posição final. Correção no teste: esperar `await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))` antes das medidas, ou emular `reducedMotion: 'reduce'` nesse teste.
- **`live-announcer.service.spec` (esperado "3 opções", recebido "novembro de 2026"):** o próprio serviço está correto (o achado A6 da Etapa 3 foi aplicado: `cancelPending()`), mas o primeiro teste lê `document.querySelector('[data-cy="live-announcer"]')` e pega **uma região deixada por outro spec** do mesmo worker (o `afterEach` desse arquivo limpa o body só depois de cada teste). Poluição entre arquivos, dependente da ordem. Correção: `beforeEach(() => document.body.replaceChildren())` (ou consultar a região pelo serviço).
- **`tooltip.directive.spec` (ponteiro do gatilho ao balão):** timer real de 250 ms (`tooltip.directive.spec.ts:53`) com a máquina sob carga; trocar por fake timers.
- **axe de `ui-kit.page.spec` (181 s), `home-commitments` e `transaction-debt` (23 s, limite de 20 s):** puro custo do axe em DOM grande sob load average 17 a 32; os dois da Etapa 4 passam isolados. Recomendo `{ timeout: 60_000 }` explícito nos testes de axe (e restringir o escopo do axe da ui-kit), não é bug.

## 4. Riscos

- A1 e M1 (duplicata por resposta perdida) são os únicos que alteram dinheiro e previsões; A1 se resolve assim que o contrato com a chave opcional for gerado.
- A divisão de despesa e o `impact` dependem do backend (T78); o front não tem prévia (FE-S-147) e não confere nada, o que é o desejado, mas o erro `SHARES_EXCEED_AMOUNT` só aparece no envio.
- `api:check` e o E2E de integração da Etapa 4 (`debts`, `recurrences`, `people`, `resetDatabase` com `recurring_transactions`/`recurrence_skips`, FE-S-153) seguem sem rodar até o contrato estabilizar; a QA deve cobrir "mesma `Idempotency-Key` não duplica" para emprestar, receber, quitar, despesa dividida e realizar.

## 5. Pendências por dono

- **Frontend:** A1 (depende de `api:types`), A2, A3, A4, M2 a M5, B1, correções dos testes (G).
- **Backend:** `Idempotency-Key` opcional em `POST /v1/recurrences` e `POST /v1/people` (M1); confirmar o comportamento de "encerrar" uma recorrência já encerrada (A4).
- **UX:** texto de falha ambígua ao criar ("confira a lista antes de repetir"); comportamento do conflito de versão (M4).
- **Produto:** nenhuma.
- **Arquitetura:** nenhuma.

## 6. Parecer

🟡 **Aprovado com ajustes.** Nenhum achado crítico: o front não calcula valores, a UI é própria, as chaves de idempotência das movimentações são reaproveitadas no retry, as camadas estão limpas e o i18n é completo salvo dois códigos novos. Corrigir antes do merge os quatro 🟠 (A1 chave de `POST /v1/debts`, A2 lista de dívidas velha no `/quick-add`, A3 "tentar de novo" morto na recorrência, A4 códigos novos) e anotar M1 no anexo FE-S como pendência de backend. As falhas de teste observadas são de carga e isolamento, não da Etapa 4.
