# Revisão do plano: adequação ao resumão (2026-10-15)

Plano: `docs/planos/2026-10-15-adequacao-ao-resumao.md`. Spec: `~/Downloads/resumão.md` (nenhum valor real é citado aqui). Referências: PR 01, PR 02, BE 04, FE 05, ADR-002/008/014/017/021.

## 1. Resumo
Plano bem estruturado: 9 blocos na prioridade do dono, 26 perguntas com dono, ADRs em Proposta, dados sintéticos, cálculo só no backend, gates por pergunta e aviso de risco no razão. A opção B do rateio (`EXPENSE` minha parte, `RECEIVABLE` pessoa, `CARD` cheia) é coerente com PR 01 (caso "João devolve" e "pagar fatura").

Os problemas estão em quatro pontos: (a) vários trechos da spec que tocam o razão ficam sem modelagem (Pix no crédito, consignado em folha, recorrência rateada, estorno de compra rateada); (b) B2 não define como evitar dupla contagem entre recorrência projetada e fatura; (c) colisão de versão de contrato e de migração com o plano em andamento do Dashboard Glass (ADR-021); (d) lotes de execução que violam as próprias dependências. Nada disso invalida o plano, mas A2 e B2 não devem começar antes dos ajustes.

## 2. Itens conformes
- Numeração de ADR: 020 e 021 existem (untracked, ADR-021 "Aceito"); 022 a 028 estão livres. Só falta ADR para o bloco H (ver F-12). O vão em ADR-010 é anterior e não afeta.
- Fatos do código conferem: contrato 2.20.0, migrações até V8.17, ADR-002 S-3 (resto na primeira parte), ADR-014 §2 (consumo bruto até reembolso).
- Aviso de dados e exclusão da carga real do escopo; fixtures sintéticas.
- Casos de PR 01 (compra 6x, pagar fatura, transferência, "João devolve") entram no aceite de A2/A6; invariantes por propriedade (Σ postings = 0, MINE + terceiros = GROSS).
- Recomendações marcadas como "não vinculantes"; P-7 (limiares do simulador) corretamente bloqueia E2 sem inventar regra.
- Contrato aditivo, `Money`, bps inteiros, erros 422 com código estável, ações devolvem o recurso (BE 04/FE 05).

## 3. Achados

### 🟠 F-1 Decisão do dono por "autorização da sessão principal" e reversão de regra anterior sem pergunta (plano:3, A3)
O cabeçalho declara que a seção 2 do resumão vale como decisão do dono "por autorização dada à sessão principal". Mensagem de agente não é consentimento. O resumão é documento do dono, então as regras são input legítimo, mas a regra 2/4 (padrão "minha parte") **reverte** a regra explícita do dono em ADR-014 §2 ("consumo bruto até o reembolso") e muda os números existentes de dashboard, resumo, relatórios e orçamentos. Isso aparece como decisão fechada em A3/A5, não como pergunta.
Impacto: números históricos mudam sem confirmação registrada.
Correção: criar P-27 (Produto): confirmar que `MINE` é o padrão e que revoga ADR-014 §2; A3/A5 bloqueadas por ela; o dono confirma pessoalmente a lista de regras da seção 2.

### 🟠 F-2 Migração P-4 pode neutralizar duas vezes (A2, aceite da migração)
Hoje o recebimento de despesa marcada é um `REFUND` ligado à compra, que abate o consumo. Se a marca antiga for migrada para rateio (gera `RECEIVABLE` e retira a parte do consumo), compras que já têm `REFUND` ficam abatidas duas vezes. O aceite só testa "consumo bruto não muda".
Correção: acrescentar casos: compra marcada com reembolso total, parcial e sem reembolso; invariante "consumo MINE + o que ainda está a receber + o já reembolsado = bruto"; decidir o destino dos `REFUND` existentes (convertê-los em recebimento do rateio por ajuste auditado, nada apagado). Patrimônio total do mês antes = depois da migração.

### 🟠 F-3 Estorno, cancelamento e valor da compra rateada não têm modelagem (A2, C2)
A2 cobre criar e `PUT shares`. Falta: estorno de compra ou parcela rateada (reverte `RECEIVABLE` proporcional), cancelar parcelas restantes (a spec cita o estorno de um curso), editar o valor da compra, e `PUT shares` quando parte já foi recebida (recebido > novo devido). C4 testa estorno sem que A2 o defina.
Correção: tasks/aceites em A2 para os quatro casos, com a regra para parte já recebida (recusar ou gerar ajuste). Definir também a trava (ADR-008) no `PUT shares` e no recebimento concorrente.

### 🟠 F-4 B2 sem regra contra dupla contagem recorrência x fatura (B2, 6)
`cardsMine` vem de faturas por vencimento; recorrências futuras ainda não estão em nenhuma fatura. A spec exige que assinatura e parcela entrem uma vez. O plano diz só "já estão em `cardsMine` quando cobradas no cartão". Não está definido: como saber se a recorrência é de cartão, quando a ocorrência prevista é substituída pela lançada, e como `offCard` é composto (spec: fixas/variáveis, Pix/débito/boleto; plano não tem fonte nem campo de forma de pagamento nem fixa/variável).
Impacto: projeção de 12 meses duplica ou omite assinaturas; é o risco central de PR 01 regra 1.
Correção: ADR-023 define a composição por fonte (faturas lançadas, parcelas futuras, ocorrências de recorrência sem lançamento, compromissos), a chave de deduplicação e o campo de forma/tipo na despesa fora do cartão. Teste: assinatura no cartão aparece uma vez antes e depois de lançada.

### 🟠 F-5 Pix no crédito e empréstimo por cartão não têm tratamento (spec §3, §7; plano F, I)
A spec trata "Pix no crédito" como empréstimo (forma: cartão), inclusive um feito para terceiro. O plano o reduz a uma marca `creditCashOut` para alerta. Lançado como compra de cartão, vira consumo (PR 01: dinheiro emprestado/recebido não é despesa; só juros são custo) e o recebimento em conta pode virar renda. O modelo de Empréstimo da spec (tipo, forma folha/cartão) também não está no contrato.
Correção: pergunta ao dono + definição na ADR (Pix no crédito = `Debt` com cronograma e juros, parcela na fatura sem consumo do principal; caso para terceiro = `RECEIVABLE`). Campos `kind` e `channel` no empréstimo. Caso de teste PR 01 "dinheiro emprestado".

### 🟠 F-6 Consignado em folha sem lançamentos definidos (F2, P-15)
Rubrica `LOAN` "reduz o líquido e não é conta a pagar", mas não se diz como o razão reflete: renda gravada em líquido e a parcela da dívida baixa sem contrapartida (desequilíbrio), ou bruto com despesa (trata amortização como consumo). Também há risco de a parcela aparecer duas vezes (dívida vencendo + desconto na folha).
Correção: ADR-026 define os postings (ex.: INCOME bruto da rubrica, `PAYABLE` −parcela, sem EXPENSE para principal) e o teste de soma zero e de ausência de saída duplicada em `owner-statement`, `DebtOverview` e `CommitmentSchedule`.

### 🟠 F-7 Defasagem do salário: P-1 omite a leitura literal da spec (P-1, B2)
A fórmula da spec é "salário líquido recebido no mês", e a tela 1 lista entradas "por data". O plano propõe competência X−1 (ADR-017) e devolve itens por data, sem apresentar ao dono a alternativa por data de recebimento (que no mês M soma saldo de M−1 e adiantamento de M). Os dois dão totais diferentes em meses de transição (promoção, consignado começando, 13º).
Correção: P-1 com as duas opções e um exemplo sintético de dois meses; `income.total` e `items` na mesma base.

### 🟠 F-8 Colisão com o plano Dashboard Glass e com o Orçamento (cap. 4, 6, 9)
O plano DG já reserva contrato **2.21.0, 2.22.0, 2.23.0** (ADR-021 §5 diz 2.23.0 para `/v1/budgets`) e migração **V8.18__budgets.sql**; este plano reutiliza 2.21 a 2.29 e não menciona o DG. Além disso, a visão `MINE` por padrão altera o "gasto" que ADR-021 define como idêntico a `month.consumption`; orçamentos, insights (ADR-019) e metas de medida (ADR-016) ficam fora da lista de endpoints com `view`.
Correção: renumerar contratos a partir do último reservado pelo DG (hoje 2.24.0), declarar a ordem de merge e dependência de DG-29; decidir se orçamento usa `MINE` (recomendação: sim, igual ao consumo) e incluí-lo no aceite de A3; revisar a numeração V9.xx após V8.18.

### 🟡 F-9 Lotes de execução violam dependências (seção 8, lotes)
Lote 2 junta D1 com D2, F1 com F2/F3, H1 com H2; lote 3 junta I1 com I2 (I2 depende de I1); lote 5 junta E1 e E2. B2 "pode começar" antes de H2/D2 e fechar depois, o que a torna não independente; o aceite de I2 depende de B2 (confidence no `OwnerStatement`), dependência não listada; o contrato de B (2.22) já traz `status`/`confidence` que só existem em I2.
Correção: refazer lotes pelas dependências; B2 só inicia com D2 e H2 prontos, ou declarar B2a/B2b; `confidence` do `OwnerStatement` com padrão `CONFIRMED` até I2.

### 🟡 F-10 Contrato de rateio e câmbio incompleto para o consumidor (6)
- Rateio só em `CardPurchaseInput`. Na spec, a mensalidade de um terceiro da família é **recorrência** no cartão; falta `shares` em `RecurrenceInput` (e na marca de recorrência já lançada).
- Divisão em três partes iguais não cabe em bps exatos (3333/3333/3334 só fecha se o front escolher quem leva o 4). Definir modo `EQUAL` ou regra de resto, e se o resto é por parcela ou no total.
- `PurchasePreview` não ganha `shares`/`myAmount`, mas A5 diz que as partes vêm do `purchase-preview`.
- Câmbio: spec usa "câmbio da fatura" (varia a cada cobrança); contrato põe um único `fxRate` na `Recurrence`, contradizendo a própria P-9 ("informado por cobrança"). Falta o câmbio na ocorrência/lançamento; moeda estrangeira em lançamento de cartão comum (spec §3) também ficou de fora.
- `ExpenseShare` (despesa de conta) e o novo rateio de cartão ficam como dois mecanismos; ADR-022 deve unificar ou justificar.
- Provenance repete `status` (`PAID`, `RECEIVED`) que o sistema já deriva na leitura (S-37): risco de dois estados divergentes. Manter só origem/confiança em provenance.
- `GET /v1/purchase-groups/commitment` convive com `/{id}`; preferir `/commitments` ou query.

### 🟡 F-11 Teste do holerite depende de dado real (F2, P-13)
O aceite diz que o teste "vive em `~/.moneylog` ou com valores sintéticos equivalentes". Teste fora do repo não roda na CI. Tabelas oficiais mudam: gerar casos sintéticos calculados de forma independente a partir da tabela oficial (não do dono) e citar a fonte oficial (P-13 deve pedir a fonte e não só os números). Também separar vigência: INSS pela competência, IRRF pela data de pagamento, que o aceite trata igual. Seed em migração não se edita depois (checksum): prever migração corretiva.

### 🟡 F-12 Tasks grandes e ADR faltando
A2 (core + PUT + migração de dados), A3 (6 áreas de leitura) e B2 são grandes. Sugestão: A2a criar, A2b `PUT shares`, A2c migração P-4; A3 por área. Bloco H altera domínio (cota por co-comprador) e não tem ADR; E (simulador) também não, e usa regra de classificação que merece ADR.

### 🟡 F-13 Defaults com impacto não perguntados
`autoDebit = false` por padrão dispara alerta em todos os cartões existentes; "FGTS nunca conta como reserva", "antecedência 3 dias", tolerância 0 e `incomeLagMonths = 1` são recomendações aceitáveis, mas precisam de resposta registrada antes de virarem aceite (D2 já fixa 25,88 antes de P-9).

### 🟢 F-14 Itens da spec sem task explícita
Limite total/disponível e cheque especial na conta (confirmar se já existem), meta com aporte sugerido (ADR-016 pode cobrir; confirmar), "fixa ou variável" e forma de pagamento em despesa fora do cartão (ver F-4), vencimentos de cartão como lacuna de dado do dono (seção 9 da spec). Segurança: perfil de renda e ativos são dados sensíveis; garantir escopo por usuário e ausência em logs nos testes.

## 4. Riscos
- Razão (A2): estorno, edição e migração mal definidos geram dupla contagem silenciosa; manter propriedade de 200 cenários incluindo estorno e recebimento parcial.
- Projeção (B2): fórmula de dedução e defasagem erradas "mentem" ao dono; validar contra a planilha dele fora do repo.
- Troca de padrão para `MINE`: muda números já exibidos, inclusive orçamentos recém-criados.
- Contrato único com 9 bumps e o DG em paralelo: conflito de versão e de migração.
- Tabelas fiscais e simulador dependem de dados e regras que só o dono fornece.

## 5. Pendências por dono
- **Produto (dono):** P-27 (MINE revoga ADR-014 §2); P-1 com as duas leituras; destino dos `REFUND` na migração P-4; Pix no crédito como empréstimo; regra de parte já recebida ao editar rateio; forma de pagamento e fixa/variável das despesas fora do cartão; câmbio por cobrança; demais P-x já listadas.
- **Arquitetura:** composição anti-dupla-contagem do `OwnerStatement`; postings do consignado; unificar `ExpenseShare` e rateio de cartão; ADR para H e E; renumerar contrato e migrações frente ao DG; lotes corretos.
- **Backend:** contrato (shares em recorrência e preview, modo `EQUAL`, câmbio na ocorrência, sem `status` em provenance); casos de estorno/cancelamento em A2; fixtures fiscais sintéticas com fonte oficial.
- **UX:** rótulo de visão "minha parte"/"bruto" em toda tela e orçamento; selo de confiança com texto; alerta de `autoDebit` sem ruído em cartões antigos.

## 6. Parecer
**🟡 Aprovado com ajustes.** A estrutura, a opção B do rateio e os gates por pergunta estão corretos, e não há 🔴. Os achados 🟠 (F-1 a F-8) precisam ser resolvidos no plano antes de despachar A2 (F-1, F-2, F-3, F-8 e o rateio de recorrência de F-10) e antes de B2 (F-4, F-7). A1 pode começar após P-25/P-4/P-5/P-6 e P-27, e a renumeração de contrato (F-8). Os contratos paralelos (B1, C1...) só depois do replanejamento dos lotes (F-9). Nova revisão do plano é dispensável se o orquestrador aplicar F-1 a F-9 e o revisor conferir o diff; revisão de código de A2 deve ser obrigatória, com foco em ADR-008, dupla contagem e os casos de PR 01.
