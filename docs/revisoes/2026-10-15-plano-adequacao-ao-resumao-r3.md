# Revisão da rev 3: plano de adequação ao resumão e ADR-022

Data: 2026-10-15. Escopo: plano rev 3 (`docs/planos/2026-10-15-adequacao-ao-resumao.md`) e `docs/adrs/ADR-022-rateio-e-minha-parte.md`. Base: PR 01, código em `backend/src/main`.

## 1. Resumo
A contrapartida `RECEIVABLE -X / EQUITY +X` é coerente com o razão e com o PR 01. O plano está bem amarrado em dependências. Há uma premissa falsa no Lote 0 (DG-28/DG-29 não estão mescladas), uma regra provisória do simulador que dá falso "SUSTAINABLE" na janela de novembro e a ADR-022 ainda com texto antigo (não aceitável como "ACEITA" enquanto A1b não rodar).

## 2. Conformes
- Livro do saldo inicial: `Account.openingPostings()` grava `ACCOUNT +saldo / EQUITY -saldo` (`core/account/domain/Account.java:78`). O livro `EQUITY` (sem `bookId`, `V1.08`) é o mesmo usado por fatura histórica (`V8.13`) e por baixa de dívida sem movimento (`Debt.java:328,440`). `RECEIVABLE -X / EQUITY +X` é o espelho do reconhecimento de recebível sem movimento: soma zero, não toca `ACCOUNT`, `INCOME`, `EXPENSE` nem `REFUND`. Respeita as regras 1, 5 e 11 do PR 01 e a eliminação de contagem dupla (o saldo já continha o dinheiro).
- Patrimônio cai exatamente X no modo "já no saldo" e fica igual no modo `ACCOUNT`: invariante declarada e testável. Escolha explícita no front, sem padrão silencioso.
- Dependências dos lotes: conferi tasks x lotes (A2b, A2c, A3c, A5a/b, B2b/B2c, C2, D2, E2, F3/F5, G2, I2/I3). Nenhum ciclo e nenhuma task antes de sua dependência.
- Dado real: plano e ADR usam Ana/Beto, Cartão A/B e valores redondos; nenhum valor, nome ou cartão do resumão. Há regra de varredura antes de commit.
- P-13: não inventa número, exige fonte citada e responde `TAX_TABLE_UNAVAILABLE`. Teste de vigências distintas está bem desenhado.
- P-12: sem valor padrão, alerta inativo. Correto.

## 3. Achados

### 🟠 A-1. Lote 0 afirma "DG-28/DG-29 já mescladas": não estão
Plano seção 8 (Lote 0) e task A1 ("Depende de: DG-29 mesclada"). No backend: última migração é `V8.17`, não existe `V8.18__budgets`, e `contracts/openapi.yaml` (2.24.0, ainda modificado e não commitado) não tem `/v1/budgets`. Impacto: migrações `V9.xx` (regra da seção 4) e A3c/A5b ficam bloqueadas, ou o Flyway sai de ordem. A1 foi marcada concluída sem a dependência que declara. Correção: reescrever o Lote 0 como "DG-28/29/31 pendentes; A3c e A5b esperam", ou confirmar com o dono a ordem (DG antes ou V9 renumerada); registrar o estado real da 2.21 a 2.23 no contrato.

### 🟠 A-2. P-7 dá falso `SUSTAINABLE` na janela de novembro
Seção 3.3 P-7, E2. A classificação só olha `months[]` de novembro; uma compra 6x com primeira parcela em novembro tem o aperto em dezembro em diante, que a regra ignora. Resultado: `SUSTAINABLE` enganoso numa decisão de compra (a regra 1 do produto, "não chutar estado"). Além disso `RISKY` por item `ESTIMATED` depende de I2 (Lote 6), mas E2 não depende de I2 (`confidence` é `CONFIRMED` fixo até lá), então o ramo é intestável em E2. `VIABLE_WITH_PLANNING` só é alcançável se o usuário já passar cortes; falta definir qual cenário (com ou sem cortes) a classificação descreve. Correção: (a) quando `installments` ultrapassa a janela, devolver `reasons[]` com aviso `HORIZON_LIMITED` e nunca `SUSTAINABLE` (ou classificar só com os meses calculados e rotular "parcial"); (b) E2 depende de I2 ou o ramo `RISKY` por estimado é removido até I2; (c) fixar na ADR-030 que a classificação é do cenário sem cortes e `VIABLE_WITH_PLANNING` vem de uma segunda simulação com cortes sugeridos.

### 🟠 A-3. ADR-022 aceita com texto desatualizado e contraditório
`ADR-022:101` ("accountId obrigatório"), §4 (só `ACCOUNT +X / RECEIVABLE -X`), §8 ("recomendação, depende de P-31b") e "Pendências" (P-28, P-31b, receber sem conta) seguem abertas, enquanto o cabeçalho diz ACEITA e o plano diz decididas. Impacto: dev lê a ADR e implementa `accountId` obrigatório e erro `DEBT_SETTLEMENT_EXCEEDS_OUTSTANDING` sem o modo "já no saldo". Correção: A1b precisa antes de A2b/A4 e deve sobrescrever §4, §5, §8, Consequências, Plano de quitação, Pendências e a lista "o que o dono precisa aprovar". Manter a regra do plano (revisor confere antes de A4).

### 🟡 A-4. "Já no saldo" indistinguível de baixa/cancelamento no `EQUITY`
`EQUITY` é o destino também de `Debt.cancel` e do saldo inicial. Sem `PostingSource` próprio (por ex. `thirdPartyReceiptAlreadyInBalance`), relatórios e auditoria não separam "recebi e já estava no saldo" de "perdoei a dívida". Correção: A1b/A4 exigem fonte de posting própria e guardar `settlement` no recebimento, com teste de que o relatório de conciliação lista só esses. Também: data do posting deve ser a do recebimento informado; impedir o modo em recebível de terceiro de outro usuário (404) e registrar idempotência (`Idempotency-Key` já existe no endpoint).

### 🟡 A-5. P-13 sem plano B para a renda de novembro e verificação da fonte só pelo dev
F2 deixa o dev confirmar a fonte oficial; um agente pode "confirmar" uma URL que não leu. Se `TAX_TABLE_UNAVAILABLE`, não há caminho para o dono informar o líquido manualmente (B2c depende de renda, `INCOME_MISSING`). Correção: (a) o dono ou o revisor valida a fonte e a vigência antes do merge de `V9.06`; (b) manter `income-profiles` com líquido informado manualmente como alternativa, para novembro nunca depender só da tabela; (c) a fixture "calculada de forma independente" deve ser conferida por pessoa, não gerada pelo mesmo dev.

### 🟡 A-6. Configurações das decisões provisórias não estão no contrato
P-12 (`subscriptionUnusedDays`), P-21 (antecedência 3 dias) e P-22 (tolerância) são configuráveis, mas o contrato 2.32.0 (seção 6, Bloco I) só cita `/v1/settings/notifications` genericamente. Correção: I1 lista os campos de settings e seus valores iniciais (`null`, 3, 0) com exemplos.

### 🟢 A-7. Nome de empresa real
Plano seção 2 (nome da empresa do dono) vem do resumão. Não é valor financeiro, mas é dado do dono em repositório privado/público futuro. Correção: trocar por "empresa do dono" (feito).

### 🟢 A-8. ADR-022 contexto pessoal
Contexto cita "mensalidade que uma parente usa". Baixo risco; trocar por "mensalidade usada por outra pessoa".

## 4. Riscos
- "Já no saldo" marcado por engano reduz o patrimônio em X sem rastro além de `EQUITY`; mitigar com A-4 e relatório de conciliação.
- Número de migração V9.xx e versões de contrato dependem de DG que não está mesclado (A-1).
- Simulador com horizonte de um mês pode induzir compra (A-2).
- Contrato `openapi.yaml` 2.24.0 está modificado e não commitado: perda ou conflito se outro bump entrar antes.

## 5. Pendências por dono
- Produto/dono: confirmar a ordem DG x este plano (A-1); aprovar a regra de P-7 com a ressalva do horizonte (A-2).
- Arquitetura: emenda completa da ADR-022 (A-3) e `PostingSource` do "já no saldo" (A-4); ADR-030 com cenário da classificação.
- Backend: settings no contrato (A-6); validação da fonte fiscal e líquido manual (A-5).
- UX: texto do aviso do modo "já no saldo" (efeito no patrimônio).

## 6. Parecer
🟡 **Aprovado com ajustes.** A contrapartida contábil está correta e as dependências dos lotes fecham; nada viola o PR 01. Antes de iniciar o Lote 1, corrigir A-1 (premissa falsa de DG), A-2 (P-7/E2) e A-3 (ADR-022 contraditória). A-4 a A-6 podem entrar na emenda A1b e no I1. Nenhum achado crítico.
