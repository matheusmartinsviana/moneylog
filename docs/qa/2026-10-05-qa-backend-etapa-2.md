# QA backend, Etapa 2 (T43)

Data: 2026-10-04/05. Agente: tester. Escopo: `backend/` (auth, categorias, contas, movimentações, idempotência, entries, dashboard, migrações V2.00 a V2.04). Nenhum código de produção foi alterado.

## 1. Resumo

- Baseline (`./mvnw clean verify`, JDK 21, Docker ativo, árvore sem modificações, 20:41): **BUILD SUCCESS**. Unitários **747 verdes**; ITs **198 verdes** (Postgres 17.11, 14 migrações validadas); cobertura de linhas do `core` **99,25%** (gate de 90% atendido).
- Foram escritos 7 ITs novos em `backend/src/test/java/com/moneylog/qa/`. Eles encontraram **12 bugs** (4 de severidade alta, 4 média, 4 baixa) e 1 observação de regra de negócio. Os bugs estão reproduzidos por testes `@Disabled("BUG-QA-xx")` para não quebrar o build até a correção.
- Sem os bugs, o restante passou: matriz de segurança, isolamento entre usuários em todas as rotas, idempotência em paralelo, edição concorrente na mesma versão, propriedade do razão (5 sementes x 120 operações), migrações sobre dados, conformidade de contrato.

Aviso sobre a execução: durante a validação o dev alterou arquivos de produção em paralelo (`TransactionGatewayImpl`, `TransactionVoiding`, `VoidTransactionUseCaseImpl`, `UpdateTransactionUseCaseImpl`, `OwnerBootstrap`, `CategorySeedRunner` e outros) e criou ITs novos (por exemplo `deveRespeitarOTetoComReembolsosEmParalelo`). Os `verify` completos feitos depois disso (749 unitários verdes; ITs com erros de contexto Spring por classes em recompilação) **não são confiáveis** e não foram usados como evidência. Todos os bugs abaixo foram reproduzidos na árvore anterior a essas mudanças; é preciso reexecutar os testes `@Disabled` depois da correção, habilitando um por um.

## 2. Casos executados

### 2.1 Matriz de segurança (`SecurityMatrixQaIT`, `AuthExtraQaIT`)

Aprovados:

- 18 operações protegidas x (sem header, lixo, `a.b.c`, assinatura adulterada, payload trocado para outro `sub`, `alg=none`, outro segredo, expirado, sem `sub`, `sub` não UUID, esquema Basic, sem o esquema): **304 combinações, todas 401 `UNAUTHENTICATED`**, `application/problem+json`, válidas no schema, `X-Trace-Id` presente, sem vazar stack, SQL ou nomes internos.
- Token na query string não autentica; expiração exata sem tolerância; `bearer` em minúsculas é aceito (RFC 7235).
- Usuário B contra recursos de A em 25 rotas e corpos (GET, PUT, archive, unarchive e void de conta, categoria e movimentação; referência de A em despesa, receita, transferência, aplicação, ajuste, reembolso, e na edição): **404 com o `code` do recurso**, nada muda (snapshot SQL antes e depois), listas de B nunca contêm ids de A, resposta não cita o id de A. `userId` injetado no corpo é ignorado.
- `Origin` inválido no refresh e no logout (ausente, `null`, vazio, outro host, sufixo, prefixo, `http`, porta, caminho, `@`, `*`): 403 `ORIGIN_NOT_ALLOWED` e no contrato; caixa e barra final são normalizadas.
- Refresh de 30 dias expira; logout idempotente (sem cookie, desconhecido, vazio); e-mail normalizado; senha de 100 mil caracteres e e-mail de 10 mil dão 400, nunca 500; refresh guardado só como hash de 64 caracteres; o access token sobrevive ao logout até o `exp` (decisão do ADR-003, documentada).
- `actuator`: só `/health` com `{"status":"UP"}`; `env`, `beans`, `heapdump`, `info`, `metrics`, `loggers` e `mappings` dão 401/404. `DELETE` e `PATCH` dão 405 com token e 401 sem. Headers `Cache-Control: no-store`, `nosniff`, sem CORS.
- Já cobertos pelos ITs da T22b (revistos, não duplicados): reuso do refresh dentro e fora dos 30 s, refresh em paralelo, rate limit com e sem proxy confiável, cookie `Secure`, troca de e-mail mantendo o `id`.

### 2.2 Concorrência (`ConcurrencyQaIT`)

Aprovados: 8 `PUT` na mesma `version` (1 x 200, 7 x 409, 1 revisão, razão fecha); 8 estornos simultâneos (1 x 200, 7 x 409 `VERSION_CONFLICT`, saldo volta uma vez); estorno x edição (5 rodadas, estado final coerente); 10 `POST` com a mesma `Idempotency-Key` (1 movimentação, mesmo id nas 10 respostas); mesma chave com corpos diferentes (1 x 201, 5 x 409 `IDEMPOTENCY_KEY_REUSED`); 12 criações com chaves diferentes; 6 categorias com o mesmo nome (1 x 201, 5 x 409); `PUT` simultâneo de conta e de categoria; saldo inicial x movimentação.
Reprovados: ver BUG-QA-01, 05, 06, 07 e 08.

### 2.3 Propriedade com semente fixa (`LedgerPropertyQaIT`)

Sementes 20261005, 7, 42, 1234567, 987654321; 120 operações cada (criação dos 6 tipos, edição, estorno, tentativas inválidas) pela API, contra um modelo independente em BigDecimal. Verificado a cada 8 operações: Σ razão ativo = 0 e cada grupo de origem = 0; estornada sem lançamento ativo e ativa com; saldo de cada conta = modelo; `inAccounts`, `investments` e `netWorth.accounts`; consumo e receita de outubro e novembro: entries = dashboard = modelo, Σ `byCategory` = total, nenhuma categoria negativa; `cashFlow` lista = dashboard; contagem e itens por status, paginados sem repetição; Σ livro EXPENSE = Σ consumo do modelo (sem dupla contagem). **5 de 5 sementes sem desvio.** Ressalva de modelagem: reembolso e despesa foram mantidos no mesmo mês (ver OBS-01).

### 2.4 Contrato

- `ContractCoverageIT` (existente) cobre 25 operações dos dois lados. Os ITs novos validam respostas de erro contra o schema (`responseOnly`): nenhuma violação nos cenários.
- `ErrorCodeConformanceQaIT`: ~70 cenários de erro. Todo `code` devolvido consta da tabela do contrato (curingas `*_REQUIRED` e `*_TOO_LONG` incluídos), **exceto `ACCOUNT_CURRENCY_NOT_SUPPORTED`** (BUG-QA-09). Códigos de domínio lançados no código mas inalcançáveis pela API (`MONEY_*`, `CURRENCY_*`, `LEDGER_*`, `TRANSACTION_VOID_CONTEXT_MISSING`, `TRANSACTION_VOID_POLICY_NOT_APPLICABLE`, `TRANSACTION_STATE_INCONSISTENT`, `INVALID_PAGE_QUERY`, `FORBIDDEN`) ficam fora do contrato sem consequência hoje; os que escapam viram 500 `INTERNAL_ERROR`, que o contrato admite.
- Códigos de `errors[].code` (`NOT_NULL`, `SIZE`, `PATTERN`, `INVALID_FORMAT`, `REQUIRED`, `INVALID_RANGE`, `OUT_OF_RANGE`, `MALFORMED_JSON`, `NOT_BLANK`) não são listados no contrato (o schema trata como string livre). Sugestão: documentar.

### 2.5 Migrações (`MigrationUpgradeQaIT`)

Banco vazio, V1.00 a V1.08 (9 migrações) com dados de dois usuários, depois V2.00 a V2.04 (5 migrações): ordem correta, checksums válidos, reexecução sem efeito, dados intactos. Sobre os dados migrados: FKs compostas recusam referência cruzada (movimentação e lançamento), `refresh_tokens.replaced_by` de outro usuário, token duplicado e expiração inválida; unicidade de nome de categoria (sem diferenciar caixa, só entre ativas); chave de idempotência única por (usuário, escopo, chave); revisão de outro usuário, duplicada e `revision = 0` recusadas. `ddl-auto: validate` passa com todas as `@Entity` (contexto sobe no baseline).

## 3. Bugs

| ID        | Sev. | Título                                                    | Camada   |
| --------- | ---- | --------------------------------------------------------- | -------- |
| BUG-QA-01 | 🟠   | Leituras respondem 500 durante escritas                   | back     |
| BUG-QA-05 | 🟠   | Reembolsos simultâneos passam do valor da despesa         | back     |
| BUG-QA-06 | 🟠   | Estorno da original e novo reembolso simultâneos          | back     |
| BUG-QA-08 | 🟠   | Arquivar conta e receber movimentação simultâneos         | back     |
| BUG-QA-02 | 🟡   | NUL em texto livre vira 500                               | back     |
| BUG-QA-03 | 🟡   | Datas fora do intervalo do Postgres viram 500             | back     |
| BUG-QA-04 | 🟡   | `page` gigante vira 500                                   | back     |
| BUG-QA-07 | 🟡   | Troca de categoria e novo reembolso simultâneos           | back     |
| BUG-QA-09 | 🟢   | `ACCOUNT_CURRENCY_NOT_SUPPORTED` fora do contrato         | contrato |
| BUG-QA-10 | 🟢   | JWT sem `exp` é aceito                                    | back     |
| BUG-QA-11 | 🟢   | Token válido de usuário inexistente gera 500 nas criações | back     |
| BUG-QA-12 | 🟢   | `errors[].code` de query com `@Size` sai como `Q`         | back     |

### BUG-QA-01 🟠 Leituras respondem 500 durante escritas (read skew)

- Reprodução: `ConcurrencyQaIT#leiturasDuranteEscritas` (`@Disabled`). Uma thread cria 60 despesas; quatro threads leem em laço `GET /v1/transactions`, `/v1/entries`, `/v1/dashboard/summary` e `/v1/accounts`.
- Esperado: nenhuma resposta 5xx; cada leitura vê um instantâneo consistente.
- Obtido: **58 de 371 leituras deram 500 `INTERNAL_ERROR`** (cerca de 16%), incluindo as telas centrais (lista, dashboard, entries, contas).
- Evidência: `TransactionFieldRequiredException: Campo obrigatório da movimentação ausente: postings`, lançada por `Transaction.restore` via `TransactionRepositoryMapper.toDomain` em `FinancialRecordsGatewayImpl.load` (`infra/finance/gateways`, linhas 41 a 53). O gateway lê primeiro os lançamentos (`postings.findAllOfTransactions`) e depois as movimentações (`transactions.findByUserId`) em consultas separadas sob READ COMMITTED; uma movimentação confirmada entre as duas leituras aparece sem lançamentos. Mesma causa do 500 visto em `POST /accounts/{id}/archive` (BUG-QA-08).
- Impacto: duas abas, ou um refetch logo após o salvar, derrubam a tela com 500 de forma intermitente. Sugestão: carregar com um único instantâneo (transação `REPEATABLE READ` somente leitura, ou ler as movimentações antes e os lançamentos filtrados por elas).

### BUG-QA-05 🟠 Reembolsos simultâneos passam do valor da despesa (S-81)

- Reprodução: `ConcurrencyQaIT#reembolsosSimultaneosNaoPassamDoTeto` (`@Disabled`, 5 rodadas, 5 falhas). Despesa de 100,00; 6 `POST` de reembolso de 30,00 com chaves diferentes, em paralelo.
- Esperado: no máximo 3 passam (Σ reembolsos <= 100,00); os demais 422 `REFUND_EXCEEDS_ORIGINAL`.
- Obtido: **os 6 retornam 201; Σ reembolsos = 180,00; consumo do mês = −80,00** nas 5 rodadas.
- Causa provável: a checagem de teto é "ler, validar, gravar" sem trava na linha da despesa original (sem `SELECT ... FOR UPDATE` nem versão). Violação da regra do PR 01 (consumo negativo por reembolso acima do cobrado).

### BUG-QA-06 🟠 Estorno da original e criação de reembolso simultâneos

- Reprodução: `ConcurrencyQaIT#estornoDaOriginalContraReembolso` (`@Disabled`, 5 de 5).
- Esperado (S-89): ou o estorno vence e o reembolso é recusado (`REFUND_INVALID_ORIGINAL`), ou o reembolso vence e o estorno é 422 `TRANSACTION_HAS_ACTIVE_REFUNDS`.
- Obtido: estorno 200 e reembolso 201; **original `VOIDED` com reembolso ativo de 30,00; consumo do mês = −30,00**.
- Causa provável: mesma ausência de trava da BUG-QA-05.

### BUG-QA-08 🟠 Arquivar conta e receber movimentação simultâneos

- Reprodução: `ConcurrencyQaIT#arquivarContraMovimentacao` (`@Disabled`). Conta com saldo zero; `POST /archive` e uma receita de 50,00 nela, em paralelo.
- Esperado: conta arquivada nunca tem saldo diferente de zero; ou a receita é 422 `ACCOUNT_ARCHIVED`, ou o arquivamento é 422.
- Obtido: em 4 de 5 rodadas, **conta `ARCHIVED` com saldo 50,00**; em outra, 500 (read skew da BUG-QA-01 dentro do caso de uso `ArchiveAccountUseCaseImpl`, linha 39).
- Causa provável: sem trava da conta entre a checagem de saldo e a gravação.

### BUG-QA-02 🟡 Caractere NUL em texto livre vira 500

- Reprodução: `RobustnessQaIT#nulNaoPodeDar500` (`@Disabled`). Corpo `{"name":"a\u0000b", ...}`.
- Esperado: 400 `VALIDATION_FAILED`. Obtido: 500 `INTERNAL_ERROR` (Postgres: `invalid byte sequence for encoding "UTF8": 0x00`).
- Campos afetados: nome e instituição de conta, nome de categoria, descrição, notas e motivo de estorno, em criação e edição (9 rotas testadas). A mensagem não vaza; o problema é o 500 e o ruído no log. Sugestão: validação comum que rejeite `\u0000`.

### BUG-QA-03 🟡 Datas fora do intervalo do Postgres viram 500

- Reprodução: `RobustnessQaIT#dataForaDoIntervaloNaoPodeDar500` (`@Disabled`). `openingDate` ou `date` = `0000-01-01`, `-0001-01-01` ou `+999999999-12-31`.
- Esperado: 400 ou 422. Obtido: 500 (`ck_ledger_postings_competence` violada no ano 0, `date out of range` no ano 999999999).
- Observação: `0001-01-01` e `9999-12-31` são aceitos como válidos (sem limite de negócio). Sugestão: faixa de datas válidas.

### BUG-QA-04 🟡 `page` gigante vira 500

- Reprodução: `RobustnessQaIT#paginaGiganteNaoPodeDar500` (`@Disabled`). `GET /v1/transactions?page=2147483647&pageSize=50` (e sem `pageSize`).
- Esperado: 400 ou página vazia. Obtido: 500 (`First result cannot be negative`): `TransactionGatewayImpl.list` faz `setFirstResult((int) page.offset())` e o offset estoura `int`. `/v1/entries` com o mesmo valor devolve 200.

### BUG-QA-07 🟡 Troca de categoria da despesa e novo reembolso simultâneos

- Reprodução: `ConcurrencyQaIT#trocaDeCategoriaContraReembolso` (`@Disabled`, 5 de 5).
- Esperado (S-81): `REFUND_CATEGORY_LOCKED` ou `REFUND_INVALID_ORIGINAL`. Obtido: `PUT` 200 e `POST` 201; reembolso ativo em Alimentação e original em Lazer, deixando consumo negativo por categoria. Mesma causa da BUG-QA-05.

### BUG-QA-09 🟢 `ACCOUNT_CURRENCY_NOT_SUPPORTED` fora do contrato

- Reprodução: `ErrorCodeConformanceQaIT#moedaForaDoContrato` (`@Disabled`). `POST /v1/accounts` com `openingBalance.currency = "USD"`.
- Obtido: 422 `ACCOUNT_CURRENCY_NOT_SUPPORTED`, código ausente da tabela do contrato; o schema `Money.currency` declara `enum: [BRL]`, o que sugeriria 400. Camada: contrato ou back (decidir um dos dois).

### BUG-QA-10 🟢 JWT assinado sem `exp` é aceito

- Reprodução: `SecurityMatrixQaIT#tokenSemExpDeveSerRecusado` (`@Disabled`). Token HS256 válido, só com `sub` e `iat`: 200 em `GET /v1/accounts`.
- Esperado: 401. `JwtTimestampValidator` só confere `exp` se presente; falta um validador de claim obrigatória. Exige o segredo para forjar, então é defesa em profundidade. Também: com `exp == agora` o token ainda vale (zero de tolerância, mas limite inclusivo).

### BUG-QA-11 🟢 Token válido de usuário inexistente gera 500 nas criações

- Reprodução: `SecurityMatrixQaIT#deveTratarTokenValidoDeUsuarioInexistente` (`@Disabled`). `POST /v1/accounts`, `/v1/categories` e `/v1/transactions` dão 500 por FK `fk_*_user`; as leituras dão 200 vazio. Sem rota de remoção de usuário hoje, então só aparece depois da troca de banco ou de segredo compartilhado. Sugestão: 401 se o `sub` não existir.

### BUG-QA-12 🟢 `errors[].code` de parâmetro de query sai como o nome do parâmetro

- Reprodução: `ErrorCodeConformanceQaIT#codigoDeValidacaoDeQuery` (`@Disabled`). `GET /v1/transactions?q=<300 caracteres>` devolve `{"field":"q","code":"Q",...}`; esperado `SIZE`. Origem: `GlobalExceptionHandler.handleHandlerMethodValidationException` usa o último segmento de `error.getCodes()[0]`.

### OBS-01 (pergunta de regra de negócio, sem severidade)

Reembolso com data em mês diferente do da despesa deixa o consumo da categoria **negativo no mês do reembolso** (despesa 100,00 em 10/10, reembolso 30,00 em 05/11: novembro Alimentação = −30,00). Teste de caracterização `ErrorCodeConformanceQaIT#reembolsoEmOutroMesDeixaCategoriaNegativa` (verde). O plano admite reembolso negativo em CONSUMPTION e pede "nunca negativo" só nos fluxos de S-81; confirmar com o produto se o reembolso deve abater a competência da despesa original.

## 4. Testes adicionados (`backend/src/test/java/com/moneylog/qa/`)

- `QaWorld.java`: helpers (usuários, contas, categorias, corpos, soma do razão).
- `SecurityMatrixQaIT.java` (15 testes, 2 `@Disabled`)
- `AuthExtraQaIT.java` (6)
- `ConcurrencyQaIT.java` (11 métodos; 5 `@Disabled` com bug; vários `@RepeatedTest(5)`)
- `LedgerPropertyQaIT.java` (5 sementes)
- `ErrorCodeConformanceQaIT.java` (4 testes; 2 `@Disabled`; 1 caracterização)
- `RobustnessQaIT.java` (4 testes; 3 `@Disabled`)
- `MigrationUpgradeQaIT.java` (1)

Para reproduzir um bug: remover o `@Disabled` e rodar, por exemplo, `./mvnw verify -Dit.test='ConcurrencyQaIT#reembolsosSimultaneosNaoPassamDoTeto'`.

## 5. Riscos e pendências

- Reexecutar o `verify` completo depois que o dev terminar as mudanças em andamento (ver o aviso do item 1) e habilitar os testes `@Disabled` conforme cada bug for corrigido.
- Rate limit do login é por IP em memória: sem proxy confiável configurado atrás de CloudFront/ALB, todos os clientes compartilham o IP do balanceador (um atacante tranca o dono); o mapa de IPs nunca é limpo (crescimento sem teto). Já registrado como pendência de deploy; vale um teste de configuração no deploy.
- Janela de tolerância do refresh (30 s) por desenho emite um novo par a quem reapresenta o token antigo; é decisão do S-83.
- Não foi medido tamanho máximo de corpo HTTP (MockMvc não representa o Tomcat).
- A concorrência foi testada via MockMvc com threads reais e Postgres real; a ordem de intercalação depende da máquina, mas os cinco cenários de corrida falharam em todas as rodadas.
- Fora de escopo: frontend e E2E (T44).

## 6. Parecer

**🟡 Aprovado com ressalvas, condicionado à correção dos quatro bugs 🟠.** A base está sólida: segurança e isolamento entre usuários sem falhas, o razão fecha em zero e lista, entries, dashboard e saldos concordam em 600 operações aleatórias, idempotência e edição concorrente corretas, migrações corretas sobre dados. Porém há falhas reais de integridade financeira e disponibilidade sob concorrência (reembolso acima do teto, estorno com reembolso ativo, conta arquivada com saldo, e 16% de 500 em leituras durante escritas) que o plano pede explicitamente que não existam (S-81, S-89, PR 01). Recomendo corrigir BUG-QA-01, 05, 06, 07 e 08 (travas de linha e leitura em instantâneo único) antes de liberar o T44, e tratar os 500 de entrada (02, 03, 04) na mesma passada.
