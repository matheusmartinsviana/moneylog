# ADR-019: insights calculados por matemática, desacoplados da IA

Status: aceita (2026-10-16). Contrato 2.20.0 (só acréscimos).

## Contexto
Os insights do mês já eram determinísticos (S-188, `InsightEngine`), mas pobres (`CATEGORY_DELTA` contra o mês anterior e `CARD_COMMITTED`), só mensais e moravam no pacote `ai`, ao lado do `AIService`. Isso passava a ideia de que o motor dos insights é a IA e acoplava o cálculo ao provedor, ao consentimento e à prévia. O dono quer insights reais, mensais e do dia, que valham sem IA, sem provedor e offline.

## Decisão
1. **Insight é cálculo.** Mora em `core/insights` (`domain`: funções puras sobre fatos; `app`: contexto e casos de uso; `exception`), sem nenhuma dependência de `core/ai` nem de `infra/ai`. Um teste de arquitetura (ArchUnit) falha a build se alguém criar essa dependência. A IA pode ler insights (o preview da IA continua usando o motor legado de categorias, inalterado); o contrário é proibido. `/v1/ai/*` e `AIService` não mudam.
2. **Uma leitura do razão por requisição (ADR-008).** `InsightContext` recebe o `FinancialRecords` carregado uma vez, as recorrências (uma leitura) e as metas (já vêm no razão; só os instantâneos são uma consulta) e monta, com memória, os fatos de cada mês e do dia. Cada mês é agregado uma vez pelas calculadoras existentes (`EntryReport`, `CommitmentSchedule`, `CashPosition`, `MonthlySummary`, `DebtOverviewCalculator`, `GoalReadModel`): nenhuma conta nova sobre o razão (PR 01, regra 10). O contexto só **classifica** as linhas de consumo em quatro classes disjuntas (parcela, recorrência, dívida, variável), então nada é contado duas vezes.
3. **Nunca inventa número.** Todo insight exige histórico, observações e materialidade mínimos; sem eles registra `insufficient` (`type`, `reason`, `missing`). Estatística robusta: mediana, MAD, `z = 0,6745 (x − mediana) / max(MAD, 5% |mediana|, 1)`, p95, CV, tudo em `BigDecimal` (nenhum `double` no core).
4. **Identidade e ordem.** `id = "ins_" + SHA-256(usuário | tipo | período | assunto)[0..32)`: estável, e diferente por usuário (id de outro usuário simplesmente não existe, 404). Ordem estável: severidade (ALERT, ATTENTION, POSITIVE, INFO), prioridade, magnitude em centavos, tipo, id. Um insight por id; `DUE_SOON` suprime o `CARD_CLOSING_SOON` da mesma fatura.
5. **Dispensa auditada.** Tabela `insight_dismissals` (V8.17), **só inserção**: dispensar insere; reverter grava `revoked_at` na mesma linha; um gatilho do banco recusa `DELETE` e qualquer outra mudança. Escopos: `TODAY` (esconde o insight no dia), `MONTH` (esconde o mesmo tipo e assunto até o fim do mês) e `TYPE` (esconde o tipo até reverter).
6. **Tom e i18n.** O backend devolve `key` + `params` (decimais em texto); o front traduz e formata, sem calcular. Textos factuais, sem culpa.

## Decisões do dono incorporadas
Histórico de 6 meses fechados, mínimo de 3. Comprometimento 50% (ATTENTION) e 70% (ALERT); serviço da dívida 30% e 40%. "Essencial" = recorrências + parcelas + dívidas. O orçamento do dia desconta só o que ainda vai acontecer no mês, sobre a renda **recebida** no mês por competência (ADR-017); **sem renda recebida não emite**. O fluxo projetado usa só entradas de recorrência e de lançamento futuro (nunca "a receber de terceiros", ADR-014). Fuso `America/Sao_Paulo`, aritmética de dias com `LocalDate`.

## Alternativas consideradas
- **IA como motor dos insights.** Rejeitada: custo e latência por chamada, não determinístico, exige consentimento e prévia, não funciona offline e pode inventar números. A IA fica como comentário opcional separado, sobre fatos já calculados.
- **Armazenar os insights calculados.** Rejeitada: o histórico é recalculado do razão (uma leitura) e nunca diverge dele; só a dispensa é gravada.
- **SQL por insight.** Rejeitada: N leituras por requisição e uma segunda calculadora paralela às do dashboard (risco de divergência, PR 01 regra 10).
- **Dispensa por exclusão de linha.** Rejeitada: sem trilha de auditoria.

## Consequências
- Novos endpoints aditivos: `GET /v1/insights/monthly`, `/daily`, `/history`, `POST` e `DELETE /v1/insights/{id}/dismissals`. `GET /v1/insights` continua como alias na forma original (só `CATEGORY_DELTA` e `CARD_COMMITTED`, cinco campos de sempre, schema `Insight` inalterado): cliente antigo, inclusive com tipos TypeScript estreitos, não vê tipo nem campo que não conhece. O insight completo é o `InsightItem`.
- O motor legado de categorias (`InsightEngine`, 10% e R$ 50 contra o mês anterior) permanece só para o preview da IA, para o payload da IA não mudar.
- Custo: com 20 mil lançamentos, `daily` e `monthly` levam de ~80 ms (aquecido) a ~400 ms (frio) em memória e o histórico de 12 meses ~800 ms (frio), todos com uma leitura do razão. Acima de ~100 mil movimentações vale a revisita prevista na ADR-008.
- Detecção de assinaturas (`RECURRING_DETECTED`) usa a descrição normalizada, que é opcional e livre: só sugere ("parece recorrente"), INFO, e pode errar para menos (não achar) ou, raramente, para mais.
- Insights de estado atual (projeção, dinheiro livre, cobertura da reserva, metas, limite do cartão) só saem no mês corrente; nos meses passados do histórico saem os que dependem só do mês e do histórico.
