---
alvo: docs/planos/2026-10-13-dashboard-glass-premium.md (revisão 3)
tipo: revisão de plano (segunda rodada)
data: 2026-10-13
revisor: revisor
parecer: aprovado com ajustes (Entrega 1 destravada após ADR-020 aprovado; 2 achados altos no plano precisam de correção antes de DG-08, DG-17/18 e DG-29)
---

# Revisão r2 do plano: Início "premium finance dashboard" com glass

## 1. Resumo
O plano corrigiu de fato os achados da rodada anterior. A extensão de `income-expenses`, o oráculo de consistência corrigido, o grafo de arquivos e o fatiamento estão bons. As decisões novas (fundo por token, SideRays lazy, BRL, cartões por emissor) são coerentes entre si. O desenho de orçamentos respeita PR 01 no cálculo do gasto, mas deixa a semântica de vigência ambígua. Sobraram 4 achados 🟠, todos corrigíveis no texto sem mudar escopo:
1. A lista de atividade (e o verde/vermelho) não define o tratamento dos tipos que PR 01 proíbe tratar como despesa.
2. A afirmação "soma dos pontos DAY do mês = ponto MONTH = month.income" é falsa quando há `incomeCompetence` (ADR-017), e o teste de propriedade da DG-18 reprova por construção.
3. Orçamento: PATCH/vigência ambíguo, risco de reescrever o passado (PR 01 regra 7).
4. Entrega 3 (Glass em Transações e Metas) contradiz Q-2 e "Não entra".

## 2. Verificação dos achados anteriores (A-1 a A-12)
| # | Status | Observação |
|---|---|---|
| A-1 | Resolvido | Levantamento parte do ADR-011 emendado; Q-7 decide Safari/mobile com medição em iPhone e volta ao sólido se falhar; DG-00 reconcilia acento do ADR com o `tokens.css`. |
| A-2 | Resolvido, com ressalva | Oráculo da DG-16 agora usa `entries`, `income-expenses` e `summaries` para consumo/receita e `transactions.totals.cashFlow` para caixa, com a divergência esperada listada. Ressalva no achado F-2 (competência de renda). |
| A-3 | Parcialmente resolvido | Extensão de `ReportPeriod`, `basis` por granularidade, `includesScheduled`, `previous/change`. Falta F-2. A mistura mês atual (com agendados) x D30 (sem) ficou explícita e rotulada (Q-27, Q-28); aceitável, ver risco R-3. |
| A-4 | Resolvido, com resíduos | Grafo com arquivos tocados criado; resíduos em F-6 a F-9. |
| A-5 | Resolvido | DG-01, DG-05, DG-07 e DG-09B foram fatiadas; e2e na mesma task do layout. |
| A-6 | Resolvido | Input `maskable`, tela de Transações intacta (aceite explícito). Lacuna menor em F-8. |
| A-7 | Resolvido | Pares calculados nos extremos do gradiente (DG-02) e do efeito (DG-02B); resultado vai ao ADR-020. Método para o efeito animado é vago (F-10). |
| A-8 | Resolvido | Q-25 com números (3 painéis com blur, LCP 2,5 s, 50 fps, p95 1,5 s) e `Save-Data`. |
| A-9 | Resolvido | Perguntas separadas; padrões assumidos registrados com dono e task. |
| A-10 | Resolvido | Orquestrador redige, dono aprova, dev aplica. |
| A-11 | Reaberto | Q-33 incorpora Transações/Formulário/Metas ao visual glass, o que contradiz Q-2 (glass só no Início) e a seção "Não entra". Ver F-4. |
| A-12 | Resolvido | `aria-checked` único, e2e do `/more`, agendadas (Q-13), casos de PR 01 no demo (DG-05). |

## 3. Itens conformes
- Tudo em BRL e sem multimoeda; "BRL" é rótulo estático (sem seletor).
- Fundo por token, sem imagem, sem licença de foto; sem `ngsw` de imagem.
- SideRays: `import('ogl')` dinâmico atrás de viewport, reduced-motion, mobile/toque, `Save-Data` e capacidade; fallback estático por token; limpeza no `DestroyRef`; cores por nome de token (compatível com `check-styles`); aceite de chunk separado e bundle inicial +1 kB. Boa decisão de projeto.
- Cartões: dados do contrato (`institution`, `currentInvoice`, `overLimit`), sem número/validade/bandeira inventados, estado vazio, sem logos, visual neutro como fallback, emissor é só apresentação e não afeta número algum.
- Cálculo só no backend; `percent=null`; `savingsRate` do backend; escrita devolve o recurso; `409` por versão; sem `DELETE`; isolamento A/B em DG-29.
- Gasto do orçamento reaproveita a calculadora de consumo (parcela na competência, reembolso abate na categoria, fatura/transferência/aplicação/empréstimo fora, estornada fora, mês civil em `America/Sao_Paulo`) e tem teste de propriedade contra `entries`, `spending-by-category` e `month.consumption`. Está alinhado a PR 01 regras 1, 3, 4, 5 e 10 e à tabela de referência (1.200 em 6x = 200; fatura 1.283 = 0).
- Total do orçamento compara com o consumo do mês inteiro (inclui sem categoria): correto.
- Migração `V8.18` correta (última existente é `V8.17`), sem editar migração aplicada.
- Testes e2e de layout atualizados na task que muda o layout; `data-cy`, i18n pt/en/es, sem comentários.

## 4. Achados

### 🟠 F-1 Atividade recente e gráficos: tipos sem tratamento definido, exceção verde/vermelho pode "despesar" o que não é despesa
`docs/planos/2026-10-13-dashboard-glass-premium.md` DG-08 (aceite, linhas ~303-307), DG-05, Q-4, DG-10.
Problema: o contrato tem 11 tipos de transação (`TransactionType`). O aceite de DG-08 define só despesa, receita, transferência e estornada. Fatura paga (`INVOICE_PAYMENT`), aplicação/resgate (`INVESTMENT`), empréstimo, quitação de dívida, ajuste e reembolso aparecem na lista (a própria DG-05 põe fatura paga e aplicação no demo) e, sem regra, o mapeador vai cair em "Saída/Entrada" por sinal do valor. Com Q-4 (saída em vermelho) isso pinta R$ 10.000 de aplicação e R$ 1.283 de fatura como despesa vermelha.
Impacto: viola PR 01 ("não tratar transferência, investimento ou empréstimo como despesa"; fatura paga é caixa, consumo 0) e dá ao usuário a leitura errada de gasto no Início.
Correção: DG-08 e DG-05 precisam de tabela tipo -> rótulo/ícone/sinal/cor. Vermelho "Saída" apenas para despesa de consumo; receita "Entrada" verde; reembolso com rótulo próprio; fatura paga, aplicação, resgate, empréstimo, quitação, ajuste e transferência em tom neutro com rótulo do tipo ("Pagamento de fatura", "Aplicação", "Transferência") e teste por tipo. No gráfico (DG-10), a série vermelha é consumo: rotular "Despesas" (não "Saídas") para não ser lida como caixa.

### 🟠 F-2 Propriedade "soma dos pontos DAY = ponto MONTH = month.income" é falsa com `incomeCompetence`
Seção 4.1 (basis) e DG-18 (aceite "soma dos pontos = totals = totais dos outros endpoints"), DG-22.
Problema: pontos `DAY` têm `basis DATE` (data em que a renda entrou); `month.income`, `entries?competence=`, `summaries/{mês}` e o ponto `MONTH` usam competência (ADR-017; openapi linha ~11284). Receita com `incomeCompetence` diferente do mês da data muda de mês na competência e não no dia. Logo, para `CURRENT_MONTH`/`PREVIOUS_MONTH`, os totais do período não podem ser a soma dos pontos DAY e, ao mesmo tempo, iguais a `month.income`. A frase "já documentado no contrato" só vale para consumo.
Impacto: ou o teste da DG-18 reprova por construção (falso alarme), ou, pior, o backend escolhe um dos lados e o Início mostra "Mês atual" com receita diferente do `month.income` (viola PR 01 regra 10).
Correção: decidir antes de DG-17 qual base manda no `totals` de `CURRENT_MONTH`/`PREVIOUS_MONTH` (recomendação: `totals` pela competência, igual ao dashboard e a `summaries`; pontos diários por data, com `basis` por ponto e nota de que a soma dos pontos pode diferir da renda por competência), e reescrever o teste de propriedade com um caso de `incomeCompetence` deslocada. O mesmo vale para `YEAR_TO_DATE` x `D90`.

### 🟠 F-3 Orçamento: semântica de vigência e PATCH ambígua (histórico, PR 01 regra 7)
DG-28 (aceite de vigência), DG-29 (`PATCH /v1/budgets/{id}`), 3.2 (regras de orçamento).
Problema: a regra diz "alterar cria nova vigência e preserva meses passados", mas DG-29 define `PATCH` que altera "limite e `effectiveFrom`" com `version`, i.e. edição in place do mesmo `id`. Não está dito se o `id` identifica o orçamento (categoria) ou a vigência, se `PATCH` insere linha de vigência ou sobrescreve, e se `effectiveFrom` pode ser retroativo (o que reescreveria meses fechados). Também não há regra para "duas alterações na mesma competência" (rejeitar?) nem para vigência arquivada/desarquivada (desde quando).
Impacto: possibilidade de reescrever o histórico sem rastro, contra PR 01 regra 7; consultar um mês passado pode mudar de valor.
Correção (para o ADR-021, antes da DG-28): modelar `Budget` (identidade: usuário+categoria|total) com linhas de vigência imutáveis (`effectiveFrom`, `amount`); `PATCH` acrescenta vigência com `effectiveFrom` >= competência atual (retroativo proibido, ou só com ajuste explícito e auditado); alteração repetida no mesmo mês substitui apenas a vigência futura/corrente ainda não consolidada, nunca a de mês anterior; arquivar tem `archivedFrom`. Acrescentar testes: alterar no mês N não muda N-1, alterar duas vezes em N, retroativo recusado, arquivar/desarquivar preserva os meses passados.

### 🟠 F-4 Entrega 3 contradiz Q-2 e "Não entra"
Q-2 (glass só no Início), seção 2 "Não entra: varredura visual das demais telas", Q-33 e DG-24 a DG-26 (restyle de Transações, formulário e Metas).
Problema: o plano assume Q-33 por delegação e simultaneamente proíbe estender o visual a outras telas. DG-25 pode ser só teste se a validação já existe; DG-24 traz `sort` (aditivo, útil) e restyle; DG-26 é puro restyle.
Impacto: escopo do MVP ampliado por padrão assumido, sem decisão do dono sobre o conflito. É o único ponto em que "o que foi assumido" muda o produto fora do Início.
Correção: separar em duas partes: funcionalidade (`sort` DG-23, filtros e busca, validação do formulário) pode entrar; restyle glass das telas fora do Início fica fora até o dono confirmar e Q-2 ser emendada. Enquanto isso, Entrega 3 não é despachável.

### 🟡 F-5 Orçamento e agendados
Regra "agendada dentro do mês conta" faz o orçamento ir a `NEAR/OVER` por compromisso futuro (PR 01 separa compromisso futuro de consumo realizado). Consistente com `month.consumption` (S-285) e, por isso, aceitável, mas precisa de rótulo `includesScheduled` também no payload e na UI de orçamentos, e confirmação do dono na ADR-021. Também faltam: razão quando limite existe e gasto é negativo (reembolso maior que gasto: `spent` negativo, `ratio` negativo, situação `OK`); categoria sem orçamento no mês; orçamento de categoria que deixa de ser "de consumo" (receita, sistema): validar `kind` com `CATEGORY_KIND_MISMATCH`. Falta também o erro de categoria arquivada na criação.

### 🟡 F-6 Arquivos compartilhados que impedem paralelismo como proposto
- `src/styles/tokens.css`: tocado por DG-01, DG-02 e DG-07 (`--card-issuer-*`). DG-02 e DG-07 não são simultâneas na ordem proposta, mas DG-07 corre em paralelo a DG-06/08/09/10/12 que consomem tokens; definir que os tokens de emissor entram na DG-01 (ou DG-07 é a única a editar naquele lote).
- `scripts/check-contrast.mjs`: DG-02 (aceite do gradiente) e DG-07 (aceite do emissor) exigem mudar o script, mas ele só consta em DG-01. Acrescentar o arquivo às duas tasks ou antecipar os pares para DG-01.
- Arquivos i18n pt/en/es e `icons.ts` são editados por quase todas as tasks do lote paralelo (DG-06 a DG-12): conflito textual de merge e quebra do spec de paridade. Sugestão: chaves por namespace/arquivo próprio, ou serializar a integração dos merges.
- `src/demo/*`: DG-05 e DG-07 (ordem correta, DG-05 antes); registrar a dependência DG-05 -> DG-07 na coluna (já existe) e proibir DG-07 de reescrever os casos de PR 01.

### 🟡 F-7 Backend: contrato compartilhado entre entregas paralelas
DG-17 (2.21.0), DG-23 (`sort`, sem versão) e DG-29 (2.22.0) editam o mesmo `openapi.yaml`, e o plano diz que o backend da Entrega 4 pode correr em paralelo à Entrega 1/2. Fixar a numeração (DG-23 = 2.21.x ou 2.22.0), a ordem de merge e quem faz `contract sync`; senão, conflitos e versões duplicadas.

### 🟡 F-8 Tabela de dependências: omissões
- DG-14 e DG-15 aparecem ambos dependendo só de DG-13; o texto (seção 6) diz que são em sequência. Corrigir a tabela (DG-15 depende de DG-14).
- DG-21 edita `analytics-panel` e `chart-panel` mas a tabela não lista DG-13 a DG-15 (o texto diz "já entregues").
- DG-31 precisa editar `home.page.*` para incluir o card de orçamentos e a tabela só lista `budget-card/*`.
- Quem aplica `maskable` no painel de notificações? DG-04 só toca `money/*`, DG-12 só o estilo do popover. Atribuir a DG-12.
- DG-13 deve depender de DG-02/02B (fundo) se a composição os inclui.

### 🟡 F-9 Contradição interna sobre dependências
Seção 2 diz "Não entra: novas dependências de runtime", e DG-02B adiciona `ogl`. Corrigir o texto (a ressalva está no ADR-020/seção 7, mas a seção 2 contradiz).

### 🟡 F-10 Contraste do efeito animado sem método
DG-02B: "contraste medido sobre os pontos mais claros do efeito" não é automatizável sobre WebGL. Definir o método (captura do canvas no frame de pior caso, amostragem de luminância por zona, opacidade máxima por token que garanta o par pior-caso por cálculo) e registrar no ADR-020. Alternativa mais simples: o painel de vidro tem fundo mínimo (alfa) que garante o contraste mesmo com a luz no máximo.

### 🟡 F-11 Cartões reais: casamento por texto e seleção
- `institution` é texto livre: "Itaú Unibanco", "BB", "Nu Pagamentos", "MercadoPago" cairão no neutro. Aceitável (fallback correto), mas a conferência dos 4 cartões do dono precisa ser um critério de aceite, não "passo"; considerar lista de apelidos conhecidos.
- Definir que só cartões `ACTIVE` entram no carrossel (arquivados fora) e o comportamento com `currentInvoice = null` (campo nulo no contrato).
- "Abre no de maior fatura corrente": comparar duas strings de dinheiro no front é uma comparação (não soma, mas é cálculo). Aceitável se feita sobre decimal exato (sem `Number`); melhor pedir ao backend ordem (ou usar a ordem da API e escolher o primeiro).
- Rótulo de "fatura corrente" não pode ser confundido com `totalCommitted` (dívida do cartão) nem com "gasto do mês".

### 🟡 F-12 Licença do componente
React Bits tem licença própria; o plano deixa a verificação para DG-02B. Como o uso é em app privado, risco baixo, mas deve ser confirmado antes de colar o código no repositório (sem esperar o PR).

### 🟢 F-13 Menores
- DG-18 usa "hoje = 13/10/2026" para D90 = 2026-07-16 a 2026-10-13: 90 dias inclusivos de 16/07 a 13/10 está correto (13/10 menos 89 dias).
- DG-16: "ponto do mês de `reports/income-expenses`" só existe em `M12`; dizer o `period` usado.
- DG-01 tem aceite "bundle não piora"; a linha de base diverge (463/527/528 kB) e a task mede, ok.

## 5. Decisões assumidas contra PR 01 e DS 00
- **Exceção verde/vermelho (Q-4).** Aceitável apenas com todas estas condições: (a) ícone, sinal e texto sempre; (b) forma e traço distintos nos gráficos; (c) vermelho restrito a despesa de consumo, nunca a fatura paga, aplicação, empréstimo, quitação ou transferência (F-1); (d) vermelho do token com contraste AA como texto no fundo escuro (a verificar no ADR-020: o plano estima `danger` ~3,7:1 sobre branco, aprovado só se passar no novo fundo); (e) registrada como decisão do dono no ADR-020 e limitada ao Início, com ADR-011/DS 00 emendados. Sem (c) a decisão viola PR 01; com (c) não viola. Observação: a justificativa do DS 00 (despesa comum não é alerta) é de UX, não de integridade; cabe ao dono aceitar.
- **Q-10, Q-13, Q-14, Q-26 a Q-31:** compatíveis com PR 01, salvo F-2.
- **Q-27:** mês atual com agendados e D30/D90 sem: aceitável porque rotulado, mas o `change` compara parcial+agendado com mês completo; manter o rótulo "vs mês anterior completo" e "inclui agendados" visíveis (já previsto).
- **Orçamentos (Q-36):** gasto conforme PR 01; pendente F-3 (histórico) e F-5.

## 6. Riscos
- R-1 Blur em Safari/iPhone com desempenho ruim: mitigado por Q-7 e Q-25; resultado só sai da DG-15/DG-16.
- R-2 WebGL em dispositivos fracos: mitigado pelas condições de animação e fallback.
- R-3 Leitura do "resultado do mês" parcial com agendados comparado ao mês anterior completo: rótulo obrigatório.
- R-4 Desempenho do Início com 50.000 movimentações (~16,8 s): só percepção melhora; reavaliar antes do deploy.
- R-5 Dois "30 dias" não ocorrem: D30 continua único (DG-17).

## 7. Pendências por dono
- **Produto (dono):** aprovar ADR-020 (decisões assumidas: Q-2 a Q-7, Q-4 com a condição F-1c); confirmar F-4 (escopo de Transações/Metas) e F-5 (agendado no orçamento); aprovar ADR-021 (F-3).
- **UX:** método de contraste do efeito (F-10), tratamento visual dos tipos neutros (F-1), conferência dos 4 cartões do dono (F-11).
- **Backend:** base do `totals` no período de mês civil (F-2); numeração do contrato (F-7); semântica de vigência e PATCH (F-3).
- **Arquitetura:** ordem de merge de i18n/`icons.ts`/`tokens.css` (F-6); licença do componente (F-12).

## 8. Liberação para despacho

### Entrega 0
- **DG-00 (redação do ADR-020): LIBERADA** para o orquestrador redigir. **Exige aprovação do dono (ADR-020)** antes de qualquer task que consuma o ADR. O ADR deve incluir a condição F-1c e o resultado numérico do contraste no fundo novo.

### Entrega 1
- **Liberada agora (não depende de DG-00 nem de DG-01):** **DG-05** (facades e demo), depois de incorporar F-1 (mapeamento dos 11 tipos no mapper e casos de PR 01 no demo). Pode ser despachada em paralelo à redação do ADR-020.
- **Exigem ADR-020 aprovado pelo dono (bloqueadas):** DG-01 (tokens, guardas, política de vidro e Safari), e, em cascata, DG-02, DG-02B, DG-03, DG-04, DG-06, DG-07, DG-08, DG-09, DG-10, DG-11, DG-12, DG-13, DG-14, DG-15, DG-16.
- **Ajustes de texto do plano antes de despachar:** F-1 em DG-08 (antes dela), F-6 e F-8 (grafo) antes do lote paralelo DG-06..DG-12, F-9 e F-10 antes da DG-02B.
- **Ordem sugerida após a aprovação:** DG-01, depois DG-02, DG-03 (DG-05 já pronta), DG-04 e DG-11, o lote DG-06..DG-12, DG-02B pode correr junto ao lote (tem só `package.json` e pasta própria), DG-13, DG-14, DG-15, DG-16.

### Fora de Entregas 0/1 (para registro)
- Entrega 2: **não** despachar DG-17 antes de resolver F-2.
- Entrega 3: **não** despachar antes de F-4.
- Entrega 4: **não** despachar DG-28 antes de F-3 e F-5 no ADR-021, aprovado pelo dono.

## 9. Parecer
🟡 **Aprovado com ajustes.** O plano preserva o MVP, cumpre PR 01 nos cálculos e resolve 11 dos 12 achados anteriores (A-11 reaberto como F-4). Para as Entregas 0 e 1 basta aprovar o ADR-020 e corrigir F-1 (obrigatório antes da DG-08/DG-05) e os ajustes de grafo (F-6, F-8). Entregas 2, 3 e 4 ficam condicionadas a F-2, F-4 e F-3/F-5 respectivamente.
