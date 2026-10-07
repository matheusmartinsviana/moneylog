---
tipo: revisão de plano
alvo: docs/planos/2026-10-10-redesign-workspace.md (T181 a T236)
data: 2026-10-10
autor: revisor
parecer: 🟡 aprovado com ajustes (as correções 🟠 inequívocas já foram aplicadas no plano; a fatia A pode começar)
---

# Revisão do plano: redesign do frontend para o workspace (DS 02)

Confrontado com: DS 02/DS 00/DS 01, PR 00 a PR 02, ADR-007/008/009, `docs/arquitetura/dominio-financeiro.md`, `contracts/openapi.yaml` (2.5.1) e o código real (`core/finance/domain/{FinancialRecords,Ledger,ConsumptionReport,EntryReport,CashFlowReport,DashboardSummary,MonthlySummary,CommitmentSchedule,CashPosition}`, `infra/note`, `infra/transaction`, `TransactionalProxies`, `app-shell`, `home`, `quick-add`, `styles`, `scripts/*`, `e2e/*`).

## 1. Resumo

A reconciliação do brief é, no geral, honesta e bem classificada: IA, MCP, provedores, orçamentos, sino, nome na saudação, seletor de workspace e selo "Up to date" estão corretamente fora ou desabilitados, o Quick Capture não finge parser, o front não calcula e a contagem (51 blocos: 27/6/12/7, com M40 em duas classes; 56 tasks = 49 + 7; 7/28/8/6 por papel) fecha. A decisão de gráficos em SVG próprio, janela só a partir de 1024 px e página rolando está bem fundamentada.

O que **não** se sustentava eram os números dos endpoints aditivos e três suposições sobre o contrato e o código:

1. a série `cash-flow` partia de uma divergência `date` × `competence` que **não existe** no razão (a competência de um posting é sempre o mês da `effectiveDate`), usava o nome de outra coisa que já existe (`CashFlowReport`) e não resolvia o mês corrente;
2. o `share` dividido pelo total líquido somava **mais de 100%** com reembolso entre meses (e contradizia o próprio teste do plano);
3. `availableChange` não é calculável de forma honesta (o `available` não tem histórico);
4. o cartão do vault dependia de um `total` que `GET /v1/notes` **não tem**;
5. o Quick Capture omitia `method` (obrigatório no contrato);
6. a sidebar da fatia A apontaria para rotas que só existem na fatia F, e a fatia C dependia da E.

Todos os itens 🟠 acima foram corrigidos no próprio plano (seção 5). Restam 🟡 e decisões para o dono.

## 2. Itens conformes

- Classificação (a)/(b)/(c)/(d): os campos citados existem com esses nomes (`Account.{institution,currentBalance,reservedAmount,uncovered,status}`, `Card.{currentInvoice,limit,availableLimit,usedRatio,overLimit}`, `MonthlySummary.{savingsRate,comparison.expensesDelta.percent,largestCategory}`, `Transaction.{description,category,account,card,date,amount,type,status}`, `EntryTotals.{total,byCategory}`, `DashboardSummary.balances/month`). Exceção: `GET /v1/notes` sem `total` (R6). O `/insights` existente é só um estado vazio de placeholder, não "insights determinísticos"; o plano já o trata como o cartão de insight novo (T207), sem prometer a página.
- Aditividade: os schemas usam `additionalProperties: false`, mas campos novos opcionais em respostas são aditivos para o cliente gerado; `Ratio` (`^-?\d+\.\d{4}$`) comporta `savingsRateDelta` negativo.
- T187: 2750/3000 = 0,9167; 2850/3000 = 0,9500; delta = −0,0333 (sobre valores já arredondados, mesmo `ratio` HALF_UP de `MonthlySummary`). Conferido.
- T188 (84/1000 = 0,0840), T229 e as contagens do plano: conferidas.
- Honestidade: Quick Capture sem parser (CA 5 e 6 de T218), bloco de IA inerte, `/ai` sem gerir chave (M48), `/mcp` "Em breve", cartão de orçamento sem número, vault sem selo de sincronização, chip "IA desligada" sem chamar endpoint inexistente.
- Escopo do front: `Number()` só para posicionar, tooltip próprio (sem `title`), nenhum `innerHTML`, tabela equivalente, `prefers-reduced-motion`, 375 px primeiro, i18n nas três línguas, `data-cy` preservados, nada nativo (`<input type=text>` é permitido pela guarda).
- Tokens: `#0066cc` sobre `surface` 5,43:1, `#2997ff` sobre `surface` escuro 5,64:1, `positive/warning/risk` ≥ 4,6:1 sobre `surface` e sobre tinta de 10%, `#8a7f72` 3,82:1 sobre `surface` (≥ 3:1 de gráfico). Falhas numéricas em 5.3.
- ADR-008: a leitura é uma carga única do `FinancialRecords`; endpoints de leitura não travam (sem risco de ordem de travas) e devem rodar em `REPEATABLE_READ` somente leitura (agora no plano).
- Numeração: T181 a T236, S-282 a S-296 e FE-S-209 a FE-S-221 não colidem com o que existe (últimos: T180, S-281, FE-S-208).

## 3. Integridade financeira dos endpoints aditivos

Refeito contra o código.

| Ponto | Resultado |
|---|---|
| `income`/`expenses` da série = dashboard, `entries`, resumo | **Só se a série ler os livros `INCOME`/`EXPENSE` por `effectiveDate`.** `ConsumptionReport`/`EntryReport` agrupam por competência (`Ledger.inCompetence`); não há calculador por dia. O plano falava em "reutilizar as calculadoras", o que é impossível sem um calculador novo; e "pela `date` do lançamento" (a da movimentação) contaria a compra de 1.200 em 6x num dia só. Corrigido (R1). Com o calculador novo, soma dos dias de um mês civil = ponto `MONTH` = `month.*` do dashboard por construção. |
| Fatura paga, transferência, aplicação/resgate, ajuste, empréstimo, quitação, `VOIDED` | Ficam de fora automaticamente (não estão nos livros `INCOME`/`EXPENSE`); reembolso abate na categoria original (livro `EXPENSE` negativo); consumo de dívida (`DEBT_RECOGNITION`) entra; despesa dividida entra só a parte de consumo. Sem dupla contagem. Mas o dia só com reembolso tem `expenses` **negativo**: o gráfico não previa (R1, T198 5a). |
| `basis` DATE × COMPETENCE | A divergência alegada não existe (D1 §1.2: competência = mês da `effectiveDate`). `basis` virou só rótulo; S-285 era uma falsa pergunta. |
| Futuro (S-258) | **A premissa do pedido não vale para a lente de consumo.** S-258 vale para caixa e compromissos. `ConsumptionReport` agrupa por competência, sem corte em `asOf`: o `month.consumption` do dashboard **inclui** lançamento datado depois de hoje dentro do mês. Logo "série nunca no futuro" e "ponto MONTH = dashboard" eram incompatíveis no mês corrente. Decisão no plano: `DAY`/`WEEK` terminam hoje; o ponto `MONTH` corrente é a competência inteira (igual ao dashboard, `partial: true`). Pergunta aberta para Produto em S-285 (cortar em hoje ou manter). |
| Janelas e fronteiras | Plano não definia `from`/`to`. Definido: `D7` = hoje−6..hoje, `D30` = hoje−29..hoje, `M3` por semanas **recortadas** na janela (13 ou 14 pontos; "13" era errado e o primeiro balde podia vazar para antes do `from`), `M12` por competência. Testes de virada de mês/ano, 23:59/00:00 em `America/Sao_Paulo` e relógio injetado exigidos em T184. |
| `share` | Dividir por `total` líquido: com categorias A=100, B=50, C=−30 (reembolso de mês seguinte), `total`=120 e `share` somam 1,25. O teste "Σ share ≤ 1 + tolerância" falharia por desenho. Corrigido (R3): `base` = Σ categorias positivas; quem arredonda é o backend (4 casas, HALF_UP); Σ share difere de 1 até `(itens+1)×0,00005` (3×0,3333 = 0,9999), o front não normaliza. `other` não soma de novo (é Σ das demais positivas). Retirado o parâmetro `period` (nenhuma task usa). |
| `availableChange` (S-290) | `available` = em contas − `committed30d` − reservado, e `committed30d` vem de `CommitmentSchedule.of(records, recurrences, today)` com o estado **de hoje** (fatura paga depois já abatida). "available no fim do mês passado" nunca existiu: variação seria mistura de movimento e mudança de estimativa. Corrigido (R4): campo `inAccountsChange` (exato por `Ledger.balance`), KPI 1 = `inAccounts`, D5 reescrita. Observação: aplicar em investimento reduz `inAccounts`; rótulo "Saldo em contas". |
| `savingsRateDelta` | Aritmética certa; ver R5 para o mês parcial. |
| Busca global | Notas por corpo com `unaccent+ILIKE` levam segundos com milhares de notas (S-279, limite de 10 s) e iriam rodar a cada pausa de digitação: corrigido para título/caminho (R11). Faltavam: ordem determinística, `q` com NUL/controle (Postgres devolve 500), escape de `%`/`_`/`\`, número do limite de taxa (o de exportação, 6/min, quebraria o debounce), `no-store`, não logar `q`, `statement_timeout`, teste de isolamento entre dois usuários também para contas/cartões/categorias/notas e medição com 50.000 movimentações. `unaccent()` é STABLE: sem índice, varredura por usuário (aceitável a 50.000, medir). |
| Leituras `REPEATABLE_READ` / travas | Os endpoints novos são leituras puras: sem travas. Precisam do proxy `snapshotReadOnly` (`TransactionalProxies`); incluído em T184/T185. |
| Desempenho do Início (R13) | ADR-008 mede 1,7 a 2,0 s e +122 MB por leitura com 50.000 movimentações; o plano passa de ~3 para ≥ 6 cargas do razão por abertura do Início. Risco novo registrado; T201 limita a 2 em voo e T184/T185 medem. |

## 4. Achados

### 🟠 Altos (todos corrigidos no plano, salvo indicação)

| # | Onde | Problema | Impacto | Correção |
|---|---|---|---|---|
| R1 | plano 5.1, T184, S-283/S-285 | Série por `date`/`competence` com premissa falsa; "reutiliza calculadoras" inexistente; M3 com 13 pontos fixos e baldes fora da janela; mês corrente × "nada de futuro" inconsistente; `expenses` negativo não previsto | número divergente do dashboard; dupla leitura de parcela; gráfico quebrado com reembolso | 5.1 reescrita, T184 critérios 3, 3a e 7, S-283 a S-285. Pergunta de Produto em S-285. |
| R2 | 5.1, todo o plano | Endpoint `reports/cash-flow` e rótulo "Saldo do período" para `net` = receita − consumo; o domínio já tem `CashFlowReport` (efeito nas contas `CASH`, inclui fatura paga e aplicação) | usuário leria "Saídas" como saída de caixa | renomeado para `GET /v1/reports/income-expenses` (`IncomeExpenseSeries`); `net` rotulado "Resultado do período" (T204) |
| R3 | 5.2, T185, T190, S-286 | `share` sobre total líquido soma > 100% com reembolso entre meses; teste do plano inconsistente | barras acima de 100% | `base` = Σ positivas, `base` na resposta, tolerância exata em T190 |
| R4 | 5.4, T188, M21/M22, D5, S-290, T202 | `availableChange` não calculável honestamente | chip "+8,4%" enganoso | `inAccountsChange`, KPI 1 = `inAccounts`, D5 e T202 atualizados |
| R5 | T202 (item 7 novo), T207, 5.5 | `comparison` do mês corrente compara mês parcial com mês anterior inteiro; no dia 10 aparece "−80%" em tom positivo | desonestidade financeira na tela principal | com `partial=true` chips em tom neutro e rótulo "mês em andamento vs mês anterior inteiro"; insight com frase neutra |
| R6 | M44, T221, FE-S-221 | `GET /v1/notes` não tem `total` (`SliceBase` só traz `hasNext`, sem `COUNT`) | task impossível sem somar páginas no front | cartão mostra última alteração; contagem só com campo aditivo (decisão de Produto) |
| R7 | 8.1, T218 | `ExpenseInput`/`IncomeInput` exigem `method`, `categoryId` e `accountId` de conta `CASH`; o plano omitia `method` e deixava `categoryId` em aberto; Salvar recolhido não podia funcionar | primeira task do Quick Capture travaria ou chutaria valor | `method: OTHER` (padrão do `/quick-add`), categoria obrigatória (expande e foca), só contas `CASH`, estado sem conta |
| R8 | T193, T194, T208, §9 | Itens `vault/ai/mcp/budgets` na sidebar da fatia A levariam ao `not-found` (páginas na F); T194 focava Quick Capture que só existe em T218; T208 linkava `/budgets` antes de T224 | fatia A não "deixa o produto inteiro funcionando"; axe/E2E de navegação | itens entram com a página de cada um; T208 cria `/budgets`; T194 navega para `/quick-add` até T218 |
| R9 | §11 | T210 (fatia C) depende de T218 (fatia E): "C → E" impossível | ordem de entrega falsa | ordem C1 → E → C2 |
| R10 | §9 | Lista de testes que mudam estava incompleta | quebra de suíte na fatia A | adicionados: `SIDEBAR_ORDER`, `MORE_ORDER`, `ROUTES`, `app-shell.component.spec` (`toHaveLength(11)`, rótulos, `/more`), laço de 20 `Tab` do `shell.e2e`, `CANVAS` (`theme-a11y`, `pwa`), testes de fonte Geist (SF primeiro quebra em macOS; `ngsw` faz prefetch do Geist), `RAW_KEY`, renome "Planejamento"→"Relatórios" (rótulo, `h1`, `<title>`), `check-contrast` só lê `#rrggbb` (tokens `*-soft` sólidos), `anyComponentStyle` 4/8 kB |
| R11 | 5.3, T186, T209 | Busca sem ordem, sem teto de custo, NUL → 500, taxa indefinida; `snippet` de nota sem regra de renderização | vazamento de desempenho; XSS se tratado como Markdown | ver seção 3 |
| R13 | riscos, T201 | Fan-out de leituras do razão no Início (ADR-008) | latência e heap na instância pequena | prioridade e no máx. 2 em voo, medição, gatilho de cache |

### 🟡 Médios (não aplicados; decisão ou ajuste fino)

- **R12 (aplicado)** Breakpoints: 1024 a 1199 px era indefinido (janela com sidebar recolhida); escopo do cabeçalho (busca e ações no shell, saudação só no Início para não duplicar `h1`); contagem de telas 14→15 e `/more` 12 destinos.
- **Ask AI desabilitado em três lugares** (cabeçalho, insight, chip "IA desligada") enquanto o sino é omitido: regra inconsistente. Recomendo omitir tudo até a Etapa 8, como o sino, ou manter um só ponto honesto (`/ai`). Botão `aria-disabled` focável sem hover é um problema de a11y em toque.
- **`/mcp`**: a promessa "escrita por MCP só criará pendências a confirmar" é compromisso de produto sem plano; marcar como intenção ou remover. Lista das 5 ferramentas como "Planejado" anuncia funcionalidade inexistente: aceitável só com D8 = "em breve" explícito.
- **`/insights`** é hoje um estado vazio de placeholder; o cartão de insight (T207) não o substitui. Definir se a rota fica no menu WORKSPACE ou só no cartão.
- T205: `EntryTotals.byCategory` é um array de `CategoryAmount` (conferido), então o fallback sem `%` é viável.
- Tamanho de tasks: T193 (sidebar + i18n + ícones + /more + 4 testes), T210 e T218 (8 critérios + mobile) são grandes; sugerido dividir T193 (grupos) × (rodapé/menu) e T218 (formulário × expansão/mobile = T219 já separa a parte mobile).
- `accent-soft` sobre `surface-muted` (4,40:1) e `accent` sobre `accent-soft` a 18% no escuro (4,35:1) falham AA; já ressalvado na seção 9, item 8.
- Mock "dados rotulados como demonstração": definir o rótulo (tag) na task T201.

### 🟢 Baixos

- Eixo Y "máximo da série": é seleção, não aritmética; aceitável. Garantir que o texto exibido seja a string do backend e não `Number()` formatado.
- `formatRatio` e `comparison-row` já existem em `features/planning`; FE-S-214 fala de um "pipe" inexistente: mover o formatador para `common` e reutilizar.
- Verificar `E2E_EVIDENCE` para os dois temas; D2 permanece sem as imagens de referência.
- Possível divergência transitória entre blocos do Início carregados em momentos diferentes (cada resposta tem seu próprio snapshot): o refresh após mutação cobre; documentar.

## 5. Correções aplicadas no plano (`docs/planos/2026-10-10-redesign-workspace.md`)

Backup da versão original só na sessão (scratchpad); nenhum arquivo fora do plano foi tocado.

1. **R1/R2** 5.1 reescrita; endpoint, schema e use case renomeados (`income-expenses`, `IncomeExpenseSeries`, `GetIncomeExpenseSeriesUseCase`); T184 (arquivos reais em `core/finance`, critérios 3, 3a, 7), S-283 a S-285.
2. **R3** 5.2 (`share`, `base`, `period` retirado, `no-store`), T185, T190, S-286.
3. **R4** 5.4 reescrita, T188, M21, M22, D5, S-290, T202 item 1; `availableChange` → `inAccountsChange` em todo o texto.
4. **R5** T202 item 7, T207, 5.5, risco novo.
5. **R6** M44, T221, FE-S-221.
6. **R7** 8.1 e T218 item 7a.
7. **R8** T193 (CA1), T194 (CA2), T208, seção 9 item 1.
8. **R9** seção 11 (ordem e Fase 6).
9. **R10** seção 9 itens 1, 5, 7 e 8; T191 item 4; T193 CA3; T198 item 5a.
10. **R11** 5.3, T186, T209.
11. **R12** 6.3 (breakpoints, cabeçalho), contagens (15 itens, 12 destinos), D3 (orçamento total × por categoria).
12. **R13** T201, riscos, T181 (versão e migração "a próxima livre").
13. T206 (`to=asOf`, reuso de `transaction-list-item`), T204 (rótulo "Resultado do período").

Nada em `backend/`, `frontend/` ou `contracts/` foi editado.

## 6. Contrato, colisões e ordem

- Contrato vigente: **2.5.1** (o vault já está nele). 2.6.0 é minor aditivo coerente; mas Etapas 7 e 8 também vão acrescentar endpoints: a versão e o número da migração Flyway devem ser "a próxima livre" no momento (ajustado em T181). Só T189 (opcional) cria migração.
- Ordem das fatias: A (frontend puro, depende só de T183) → B ∥ backend (T181 a T190) → C1 (T201 a T209) → E → C2 (T210 a T212) → F → D → fim. T201 depende só dos tipos (T181), T209 de T186, T211 de T190. Dependências conferidas, nenhum ciclo.
- Tasks grandes: ver 🟡.
- Colisão em `contracts/openapi.yaml` com o vault: o arquivo já contém o vault em 2.5.1; confirme com o dev-backend se ainda há edição em curso antes de T181.

## 7. Decisões do dono (D1 a D8)

Padrões conservadores e razoáveis, exceto onde alterei: **D5** passa a `inAccounts` (R4). **D3** ganhou a pergunta de que o brief mostra orçamento **total** (R$ 6.000) com aberto por categoria, enquanto a fatia G é por categoria sem teto global. D1, D2, D4, D6, D7, D8: ok como estão. Nova pergunta (S-285): o ponto do mês corrente da série inclui lançamento agendado (igual ao dashboard) ou corta em hoje? Padrão adotado: igual ao dashboard. Pergunta (R6): querem contagem de notas (campo aditivo `total`)?

## 8. Riscos remanescentes

Janela flutuante × overlays/WebKit (spike T192), fan-out de leituras (R13), consistência visual com SF em Apple vs Geist em outros, percepção de dado inventado nos mocks, tamanho das fatias C e F.

## 9. Pendências por dono

- **Produto:** S-285 (mês corrente), D3 (total × categoria), D5 revisada, contagem de notas, "Planejamento" × "Relatórios", Ask AI desabilitado (manter ou omitir), frase do `/mcp`.
- **UX:** D2 (imagens), pares de contraste de `*-soft`, tablet 1024 a 1199.
- **Backend:** calculador `IncomeExpenseSeries`, medição a 50.000 movimentações, rate limit da busca (120/min), campo `total` de notas se aceito.
- **Arquitetura:** gatilho do cache por usuário (ADR-008) se a medição estourar; ADR-011 (T183).

## 10. Parecer

**🟡 Aprovado com ajustes.** Com as correções R1 a R13 já aplicadas no plano, ele é executável e honesto. Nenhum 🔴. As tasks de backend T184 a T188 só devem começar depois de T181/T182 e das respostas de Produto em S-285 e D5 (os padrões adotados são conservadores e permitem começar).

**Liberadas para começar agora:** a **fatia A** (T183, depois T191, T195 em paralelo, T192, T193, T194; T196 e T197 ao final), e a **fatia B** (T198, T199 depois de T191). T181 aguarda a confirmação de que o dev-backend do vault terminou e T182 reexamina o contrato.
