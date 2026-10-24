# ADR-034: token pessoal de lançamento rápido (Atalho do iPhone) e `POST /v1/quick-entries`

Status: **PROPOSTA** (2026-10-21). Decisões do dono aprovadas em 2026-10-21: Q1, Q3, Q5, Q6, Q7, Q8 e Q17 (seção 1). O dono dispensou o portão G0 (teste no iPhone); os itens 1, 3, 4, 5 e 7 do G0 entram como **premissas não verificadas** (seção 11). Complementa o ADR-032 (multiusuário) e o ADR-003 (autenticação), abre uma exceção ao ADR-012 (mensagem pronta só neste endpoint) e não altera o ADR-002 (razão). Contrato: 2.40.0 (só acréscimos). Plano: `docs/planos/2026-10-21-lancamento-rapido-iphone.md` (T1). Revisão do plano: `docs/revisoes/2026-10-21-lancamento-rapido-iphone.md`.

## Contexto
O dono quer registrar um gasto ou uma entrada em poucos toques no iPhone, com o Toque Duplo nas Costas disparando um Atalho (app Atalhos), sem abrir o app e sem digitar login. O iOS não abre o PWA instalado a partir de um Atalho; o gatilho do Toque nas Costas só roda um Atalho. Logo, o Atalho precisa chamar a API, e a API precisa de uma credencial que o Atalho consiga guardar. O JWT de sessão (15 min, refresh em cookie `HttpOnly` de `Path=/v1/auth`) não serve: o Atalho não tem cookie nem tela de login.

A credencial nova é um segredo de longa duração guardado em texto dentro de um Atalho (iCloud, backup, legível por quem desbloqueia o aparelho). O desenho abaixo trata isso como a ameaça central: escopo mínimo, conta fixa, expiração curta, revogação, tetos e auditoria.

A integridade financeira (PR 01) não é tocada: o canal chama o **mesmo** caso de uso de `POST /v1/transactions` e não cria regra de cálculo própria. Não há dupla contagem, transferência, investimento ou empréstimo tratado como despesa, nem compra parcelada pelo canal.

## Decisão

### 1. Decisões do dono (2026-10-21)
| # | Decisão |
|---|---|
| Q1 | Dois tipos, `INCOME` (Entrada) e `EXPENSE` (Gasto). "Saída" é gasto. O teto diário próprio e menor para a entrada, aprovado antes, passou a ser **opcional e desligado** (ver Q7). |
| Q3 | Variante X: a **conta é vinculada ao token** (um token por aparelho e conta). Não há tabela de conta padrão por usuário nem endpoints de configuração. |
| Q5 | Quando o Atalho não manda `method`, vale `OTHER` ("Outro"), o mesmo padrão de `POST /v1/transactions` (contrato 2.11.0). A decisão original era "nulo", mas o domínio exige método em toda movimentação de conta (`PaymentMethodRequiredException`); `OTHER` não afirma nada e respeita "nada de `PIX` por chute". Ajustada na revisão da T5 (2026-10-21) sem objeção do dono. |
| Q6 | Regra do valor digitado da seção 6. |
| Q7 (revisada pelo dono em 2026-10-21) | Validade de 30 dias de padrão e 90 de máximo; 3 tokens ativos por usuário. **Sem limite de valor por lançamento nem de quantidade ou total por dia**: o dono não quer esses tetos. Eles existem como configuração, **desligados por padrão** (propriedade ausente ou 0 = sem limite), e podem ser ligados depois sem migração (seção 7). Continuam valendo o limite técnico de sanidade do valor (o mesmo de `POST /v1/transactions`, R$ 999.999.999,99) e o rate limit por token e por IP. |
| Q8 | Desativar o usuário **revoga o token de vez**; reativar não o ressuscita (token novo); trocar a senha **não** revoga. |
| Q17 | Sem trava de duplicata provável no MVP. |

A decisão anterior (R$ 1.000,00 por lançamento, 30 por dia, R$ 3.000,00 por dia em gastos e R$ 1.000,00 por dia em entradas) foi **substituída** por esta. Os valores antigos servem apenas de exemplo nas mensagens de erro do contrato, para quando o dono ligar um teto.

### 2. Credencial (PAT)
- **Escopo mínimo** `QUICK_ENTRY`: só `POST /v1/quick-entries`, só `EXPENSE` e `INCOME`. O token não lê, não edita, não apaga, não estorna e não cria nem revoga token.
- **Formato** `mlq_<8 caracteres de prefixo>_<256 bits em base64url (43 caracteres)>`. O prefixo existe só para o usuário reconhecer o token na lista; não autentica.
- **Hash SHA-256** do token inteiro (256 bits de entropia dispensam BCrypt, mesmo critério do convite no ADR-032). O **lookup é sempre por hash**, nunca por prefixo, com comparação em tempo constante. O segredo nunca vai a log, listagem, URL nem coluna.
- **Mostrado uma vez**, na resposta de criação (`Cache-Control: no-store`). Depois só `prefix`.
- **Expiração**: `expiresInDays` de 1 a 90, padrão 30. `status` é derivado na leitura (`REVOKED` se há `revokedAt`, senão `EXPIRED` se venceu, senão `ACTIVE`).
- **Revogação**: manual (`POST /v1/quick-entry-tokens/{id}/revoke`, idempotente, `revoked_reason = USER`) ou por desativação do usuário (`revoked_reason = USER_DISABLED`, na mesma transação do `disable`). Reativar o usuário **não** reativa tokens. Não há `DELETE`: o histórico fica para auditoria (PR 01, regra 7).
- **Vínculo à conta**: o token pertence a `user_id` e `account_id` (FK composta `(account_id, user_id)`). Só contas próprias, ativas e de tipo `CHECKING`, `SAVINGS` ou `WALLET` (liquidez `CASH`); conta de investimento e conta arquivada são `422 QUICK_ACCOUNT_NOT_ALLOWED`. Conta de outro usuário ou inexistente: `404 ACCOUNT_NOT_FOUND`. A T3 reconfere o enum `AccountType` no código antes de fixar a lista. Se a conta do token for arquivada depois, o lançamento responde `422 QUICK_ACCOUNT_NOT_ALLOWED`.
- **Quem gera**: qualquer usuário `ACTIVE` (`OWNER` ou `MEMBER`), só na própria conta. Gestão exige **sessão JWT**.
- **Usuário `ACTIVE` lido do banco a cada requisição** (como no ADR-032); a claim do JWT nunca autoriza.
- **Observabilidade**: `last_used_at` (no máximo uma gravação por minuto), `last_used_ip` **mascarado** (IPv4 sem o último octeto; IPv6 sem os 80 bits finais, LGPD) e `last_used_user_agent` truncado em 120 caracteres, exibidos na tela. Alerta em `SecurityAlerts`/`SecurityEventLog` para rajada de `401` (proposta: mais de 10 falhas em 5 minutos por IP) e para primeiro uso a partir de IP não visto antes. Criar e revogar geram evento de segurança sem o segredo.

### 3. Autenticação: cadeia de segurança separada
- Nova `SecurityFilterChain` com `@Order` **menor** que a `apiSecurity` atual e `securityMatcher` **exato** em `POST /v1/quick-entries`. A rota fica fora do `anyRequest()` da cadeia JWT, que continua rejeitando `mlq_` por não ser JWT.
- Stateless, **não lê cookie**; CSRF e CORS desligados como na cadeia atual (o Atalho não é navegador). A T4 confirma que `OriginCheck` não bloqueia chamada sem `Origin`.
- O JWT de sessão **não vale** nesta rota no MVP (`401`).
- Falha de autenticação: `401 QUICK_TOKEN_INVALID` com **mesmo status, corpo e cabeçalhos** para token inexistente, expirado, revogado ou de usuário `DISABLED`. A equivalência de latência não é prometida em teste unitário; o lookup é sempre por hash.
- Variantes de rota testadas (T4): `GET /v1/quick-entries`, `HEAD`, `OPTIONS`, barra final, `//` e `;jsessionid` não aceitam o token nem caem em rota aberta. Matriz de rotas do contrato percorrida com o token: todas as outras respondem `401`.
- O valor de `Authorization` não pode aparecer em log da aplicação, `RequestRejectedHandler`, handler de exceções, `Caddyfile` nem log da Cloudflare (T4 verifica; se o Caddy logar cabeçalhos, a configuração é corrigida no repositório principal).

### 4. Rate limit
No molde do `LoginRateLimiter` e com `ClientIpResolver`, em memória (ADR-003):
- **Por IP, só falhas de token**: acima do limite na janela, `429 TOO_MANY_ATTEMPTS` com `Retry-After` (proposta: 10 falhas em 5 minutos).
- **Por token válido**: acima do limite por minuto, `429` com `Retry-After`; o token continua válido (proposta: 20 chamadas por minuto).
O código usa `TOO_MANY_ATTEMPTS`, o mesmo do restante da API, e não um código novo.

### 5. Idempotência (um único claim)
- O caso de uso rápido reivindica `idempotency_keys` no escopo `POST /v1/quick-entries`. Para não haver dois claims aninhados, a T5 **extrai do `CreateTransactionUseCase` o miolo** que cria a movimentação (hoje o claim do escopo `POST /v1/transactions` é interno) e o chama já dentro da transação do claim. `POST /v1/transactions` continua igual, com um claim no escopo antigo e testes inalterados.
- **Chave opaca**: o header aceita UUID ou `[A-Za-z0-9_-]{8,64}` (o UUID também cabe no padrão). Para não-UUID, a chave vira o UUID `nameUUIDFromBytes(userId + ":" + chave)`. Usa `userId`, não `tokenId`: trocar de token não quebra o dedupe. Colisões são tratadas pela unicidade `(user_id, scope, key)`.
- **Hash do pedido sobre o input bruto** (`kind`, `amount` como texto, `category`, `description`, `method`, `date` como veio, inclusive ausente, e o `accountId` do token). O `accountId` entra no hash porque a chave é por usuário e não por token: sem ele, dois aparelhos com tokens de contas diferentes, mesma chave e mesmos valores deduplicariam em silêncio e o lançamento sumiria da outra conta; com ele vira `409` visível. Rotacionar o token na mesma conta continua deduplicando. Assim, `date` ausente não vira data resolvida no hash e o reenvio depois da meia-noite do fuso continua sendo replay, não `409`.
- Mesma chave e mesmo input: `201` com o **mesmo `id` e o mesmo `message`** (o `message` é remontado do lançamento gravado). Mesma chave e input diferente: `409 IDEMPOTENCY_KEY_REUSED`. Erro não memoriza a chave. Validade de 24 h.
- **Replay de lançamento estornado**: o replay **não recria** o lançamento e devolve o recurso com o `status` atual (`VOIDED`) e o mesmo `id`. O `message` remontado diz o estado real: "Gasto de R$ 35,50 em Alimentação (Carteira) registrado e depois estornado." (entrada: "Entrada de ... registrada e depois estornada."). Quem quer lançar de novo roda o Atalho outra vez (chave nova).
- A chave protege o **reenvio do mesmo disparo**. Duas execuções manuais com valores digitados são dois lançamentos legítimos; não há trava de duplicata (Q17).
- Chave por data e hora (`yyyyMMddHHmmss`) colide em duas execuções no mesmo segundo: com comandos diferentes é `409`; com comandos iguais é dedupe silencioso. O documento operacional (T9) explica.

### 6. Valor digitado (Q6) e moeda
Moeda BRL. `amount` aceita **texto** em formato brasileiro ou **número JSON** (`oneOf`). O que o campo Número do Atalho envia é número com ponto decimal (observado no aparelho do dono: corpo cru `27.6`, exato). O parser vive no backend, sem `double` nem `float`, e produz o `AmountInput` canônico antes de chamar o caso de uso. `POST /v1/transactions` continua estrito.

**Número JSON.** O servidor lê o número **pelo texto do JSON**, como decimal exato (`BigDecimal` a partir do token do JSON, por exemplo `JsonNode` com `USE_BIG_DECIMAL_FOR_FLOATS`/`DecimalNode`, nunca `double`, `float` nem `Number.doubleValue()`). Vale: positivo, no máximo 2 casas, mesmos tetos do texto. Mais de 2 casas (`27.605`), zero, negativo ou notação científica (`1e3`, `2.5E1`) é `422 QUICK_AMOUNT_INVALID`. Um valor como `27.600000000000001` (artefato de reler como `double`, que só aparece em ferramentas como o httpbin) também é recusado por ter mais de 2 casas. O hash de idempotência usa o **texto cru** do valor como veio (`27.6` e `"27,60"` são pedidos diferentes). Regras do texto:
- Remover `R$` e espaços.
- Se há vírgula, ela é o decimal (1 ou 2 casas) e os pontos antes dela são milhar, em grupos de 3.
- Sem vírgula, o ponto só é decimal com **1 ou 2 casas depois**. É **ambíguo** (`422 QUICK_AMOUNT_AMBIGUOUS`, "Use vírgula nos centavos, por exemplo 1.234,00") o ponto seguido de 3 dígitos que formam uma leitura válida de milhar (`1.234`, `35.500`, `1.234.567`). Ponto com 3 ou mais dígitos que não forma milhar (`1234.567`, `1.2345`) não tem leitura válida e é `422 QUICK_AMOUNT_INVALID` (pedir vírgula não resolveria).
- Mais de 2 casas decimais, zero, negativo, só espaços ou letras: `422 QUICK_AMOUNT_INVALID`. `amount` vazio ou com mais de 40 caracteres é `400 VALIDATION_FAILED` na borda (contrato 2.40.2).

Tabela de casos (fixada aqui e testada na T5, inclusive com teste de propriedade: todo centavo formatado e parseado volta igual):

| Entrada | Resultado |
|---|---|
| `35` · `35,5` · `35,50` · `1,5` | 35.00 · 35.50 · 35.50 · 1.50 |
| `1.234,56` · `1.234.567,89` · `R$ 35,00` | 1234.56 · 1234567.89 · 35.00 |
| `35.50` · `35.5` | 35.50 · 35.50 |
| `1.234` · `35.500` · `1.234.567` | `QUICK_AMOUNT_AMBIGUOUS` (422, "use vírgula nos centavos") |
| `10,005` · `1,234,56` · `12.34,56` · `1234.567` · `1.2345` | `QUICK_AMOUNT_INVALID` |
| `0` · `0,00` · `-5` · só espaços · `abc` | `QUICK_AMOUNT_INVALID` |
| vazio (`""`) · mais de 40 caracteres | `400 VALIDATION_FAILED` (borda, antes do parser) |
| acima de R$ 999.999.999,99 (limite técnico) | `QUICK_AMOUNT_INVALID` |
| acima de um teto por lançamento, **só se configurado** | `QUICK_LIMIT_REACHED` |

`amount` que não seja texto nem número (booleano, objeto, lista) é `400`.

Casos do número JSON (testados na T5/T6):

| Corpo | Resultado |
|---|---|
| `27.6` · `27.60` · `35` · `1234.56` | 27.60 · 27.60 · 35.00 · 1234.56 |
| `35.500` (zeros à direita não contam; o texto `"35.500"` é ambíguo, o número `35.500` vale 35,50 porque número JSON não usa ponto de milhar) | 35.50 |
| `27.605` · `0.001` | `QUICK_AMOUNT_INVALID` |
| `0` · `0.0` · `-5` | `QUICK_AMOUNT_INVALID` |
| `1e3` · `2.5E1` | `QUICK_AMOUNT_INVALID` |
| número acima do limite técnico / de um teto configurado | `QUICK_AMOUNT_INVALID` / `QUICK_LIMIT_REACHED`, como no texto |

### 7. Limites (Q7 revisada) e propriedades
Só a validade e o número de tokens são limites ativos. Os tetos de uso são **configuráveis e desligados por padrão**: propriedade ausente ou `0` significa sem limite.

| Limite | Padrão | Propriedade proposta (`moneylog.quick-entry.*`) |
|---|---|---|
| Validade padrão / máxima do token | 30 / 90 dias | `default-validity-days` / `max-validity-days` |
| Tokens ativos por usuário | 3 | `max-active-tokens` |
| Limite técnico de sanidade do valor | R$ 999.999.999,99 (o de `POST /v1/transactions`) | fixo |
| Valor por lançamento | desligado | `max-amount` |
| Lançamentos por dia | desligado | `max-entries-per-day` |
| Valor total de gastos por dia | desligado | `max-expense-per-day` |
| Valor total de entradas por dia | desligado | `max-income-per-day` |
| Rate limit por IP (falhas de token) | 10 por 5 minutos | seção 4 |
| Rate limit por token válido | 20 por minuto | seção 4 |

Quando algum teto estiver ligado, vale o que segue; com todos desligados, nada disto se aplica. O "dia" do teto diário é definido pelo **instante de criação** (`createdAt` do lançamento, ou `quick_entry_audit.created_at`), convertido no fuso do usuário (`users.time_zone`), **nunca pela `date` do lançamento**. Contar pela `date` daria um balde por dia dos 366 dias retroativos e anularia o teto. O teto conta só lançamentos **ativos** (estornados saem da conta). A quantidade vale para os dois tipos juntos; os totais são separados por tipo, por **usuário** (somando todos os tokens dele). Teto estourado: `422 QUICK_LIMIT_REACHED`, nada gravado, e o `detail` diz qual. O código existe no contrato mas só ocorre se o dono configurar um teto.

**Serialização condicional.** Se **algum teto diário estiver ligado**, a conferência e a gravação do lançamento acontecem na mesma transação do claim de idempotência, sob **lock por usuário** (`SELECT ... FOR UPDATE` na linha do usuário ou advisory lock por `user_id`), para que requisições paralelas não ultrapassem quantidade nem valor; a T5 testa isso com um teto ligado. Com todos os tetos desligados o lock não é exigido. Os nomes das propriedades e os limites de rate limit (seção 4) são proposta técnica e podem mudar na T3/T4.

### 8. Categoria, data e método
- **`category` é opcional** (fluxo do Atalho: tipo, nome e valor). Omitida, a movimentação **recebe a categoria de sistema padrão**, `OTHER_EXPENSE` (gasto) ou `OTHER_INCOME` (entrada), a mesma regra de `categoryId` ausente em `POST /v1/transactions` (contrato 2.11.0). Nunca fica sem categoria, o que respeita o domínio atual (consumo por categoria no dashboard e nos relatórios exige categoria), e a resposta traz a categoria aplicada (`QuickEntryResult.category` não é nulo). Se a categoria padrão não existir ou estiver arquivada, vale o erro existente `422 DEFAULT_CATEGORY_UNAVAILABLE`, sem gravar. Enviada: chave de sistema (`FOOD`) ou nome sem acento e sem caixa, entre as categorias **ativas do próprio usuário**; nunca por id. Inexistente, arquivada ou de outro usuário: `422 QUICK_CATEGORY_NOT_FOUND`, sem classificar em silêncio.
- `date` omitida = hoje no fuso do usuário; aceita de hoje menos 366 dias até hoje; futura ou mais antiga é `422 QUICK_DATE_OUT_OF_RANGE`. A hora não é gravada (a movimentação guarda só a data; `createdAt` guarda o instante).
- `method` é opcional, só do gasto, e vale `OTHER` se omitido (Q5 ajustada); numa entrada, o método gravado é sempre `OTHER`, e a resposta traz o método gravado (nunca nulo). Enviado numa entrada, é `400 VALIDATION_FAILED` (decisão técnica do contrato: ignorar em silêncio esconderia erro do Atalho).
- Fora do MVP: compra no cartão, transferência, investimento, empréstimo, parcelado, estorno, edição e exclusão pelo token. O `kind` é enum fechado.

### 9. Resposta pensada para o Atalho (exceção ao ADR-012)
O Atalho não traduz código de erro e "Obter conteúdo de URL" não falha em `4xx/5xx` (premissa, seção 11). Por isso, **só neste endpoint**, o `201` traz `message` e os erros trazem `detail` em português pronto para a notificação. É uma exceção a "o backend não grava frase pronta" do ADR-012; as demais rotas não mudam.
- O `message` usa **apenas valor formatado pelo backend e nomes já gravados** (categoria e conta). **Nunca ecoa `description`** nem texto livre digitado, porque a notificação do iOS aparece na tela de bloqueio. Exemplo: "Gasto de R$ 35,50 em Alimentação (Carteira) registrado.".
- A formatação de moeda pt-BR neste texto é lógica do backend, restrita a este endpoint. Valores continuam `Money` na resposta.
- A resposta de sucesso não traz saldo nem lista de contas ou categorias.
- **Aviso por push do lançamento criado (decisão do dono, 2026-10-21).** Quando o Atalho cria um lançamento (nunca no replay idempotente), o dono recebe um push "Despesa incluída pelo Atalho: R$ 54,60 · Mercado" (ou "Receita"). É **exceção à regra do `message`**: o push mostra o valor e a `description` (até 80 caracteres, cortada por code point) na tela de bloqueio, porque o dono pediu o texto assim. Regras: só push (sem sino); sem limite de frequência por tipo e **sem teto por hora** (decisão do dono); só sai se o interruptor geral de push do usuário estiver ligado, ignorando horário silencioso e tipos desligados; só o dono do token recebe, em todos os aparelhos dele; fila própria e limitada (100), de modo que um volume alto nunca atrase os alertas de segurança; falha ao enviar só gera log e não afeta o `201`. O payload leva `type`, `amount`, `description` e `transactionId`, nunca token, hash nem IP. O frontend renderiza a `description` como texto puro.

### 10. Auditoria por token e filtro `source`
- Tabela `quick_entry_audit(transaction_id, token_id, user_id, ip, created_at)` com FKs compostas, fora de `transactions` (que não é alterada). O `ip` é guardado **mascarado**, como o `last_used_ip` (IPv4 sem o último octeto; IPv6 sem os 80 bits finais). **Proposta aguardando o dono** (LGPD): a tabela é permanente, então guardar o IP completo exigiria base legal e retenção definidas por ele; a opção segura é o IP mascarado, e o dono pode decidir diferente. Responde "quais lançamentos este token criou" e permite resposta a incidente.
- `TransactionSource`/`TransactionOrigin` ganham `QUICK_SHORTCUT`; o `CHECK` `ck_transactions_source` é substituído por migração nova (a V8.13 não se edita). Listas, filtros, exportação CSV e backup/restauração aceitam o valor.
- `GET /v1/transactions` ganha o filtro opcional `source` para localizar e estornar pelo app o que o canal criou. Estorno em lote pela UI é Fase 2.
- O token **não estorna**. O estorno é pelo fluxo normal (`void`), que cria o lançamento oposto no ledger e não apaga nada.

### 11. Premissas do iOS não verificadas
O dono dispensou o portão G0 (teste no iPhone, antes da T1). Os itens abaixo **não foram verificados em aparelho**; são premissas explícitas, com o que muda se forem falsas. Os fatos de iOS vêm de conhecimento da documentação da Apple e do WebKit até meados de 2026, sem acesso à internet na sessão. **Nenhuma resposta do G0 foi inventada.**

| G0 | Premissa | Se for falsa |
|---|---|---|
| 1 | O Toque Duplo dispara o Atalho com o iPhone desbloqueado, e o Atalho consegue pedir entrada. Não se sabe se, com o aparelho bloqueado, pede Face ID, nem se funciona com o app moneylog aberto ou fechado. | O uso fica restrito a aparelho desbloqueado e o guia (T8/T9) diz isso. Se o Atalho nem rodar pelo Toque Duplo, o gatilho muda para ícone na tela de início, sem mudança de API. |
| 3 | **Parcialmente respondido no aparelho do dono:** o campo Número do Atalho envia **número JSON com ponto decimal** e resolve vírgula e milhar sozinho (corpo cru `27.6`, exato; só o httpbin mostra `27.600000000000001` ao reler como `double`). Isso foi observado, não testado em escala. Continua premissa que um Atalho com campo de texto mande vírgula, ponto ou milhar; a regra da seção 6 aceita as três formas e recusa o ambíguo. | Se sair sempre com ponto decimal e sem milhar, a regra continua correta e o `QUICK_AMOUNT_AMBIGUOUS` quase não ocorre. Se sair em formato que a regra recusa (por exemplo milhar com ponto e centavos com ponto), o Atalho passa a usar "Pedir Entrada" de texto e o documento operacional ensina o formato; a regra do backend não afrouxa (risco de erro de 1000x). Se o Atalho passar a enviar o número como `double` arredondado (mais de 2 casas), o backend recusa com `QUICK_AMOUNT_INVALID` em vez de arredondar em silêncio. |
| 4 | **Premissa, não confirmada:** supõe-se que o Atalho não tenha ação nativa de UUID, e que a ação de número aleatório, se existir, não esteja garantida. Por isso a `Idempotency-Key` é planejada a partir de data e hora (`yyyyMMddHHmmss`) e o contrato aceita `[A-Za-z0-9_-]{8,64}`, não só UUID. | Se existir ação aleatória, o Atalho acrescenta sufixo aleatório e reduz a colisão no mesmo segundo; o contrato já aceita (nenhuma mudança). Se o Atalho só conseguir chave fraca, a proteção contra reenvio continua valendo, mas colisões geram `409` confuso (explicado no documento operacional). |
| 5 | **O Toque Duplo pode disparar o Atalho duas vezes** (ou duas execuções simultâneas). A idempotência por chave **não** cobre isso, porque cada execução pede o valor de novo. | Sem trava de duplicata (Q17), uma batida dupla pode gerar dois lançamentos. Se o teste real mostrar que ocorre, a decisão volta ao dono (trava de mesmo valor, tipo e categoria em N segundos, ou aviso). O estorno pelo app e o filtro `source` são a mitigação. |
| 7 | "Perguntas de importação" aceitam o token e a URL base, e **o token fica em texto claro dentro do Atalho já importado**, legível por quem desbloqueia o iPhone, e vai para iCloud e backup. O link iCloud compartilhado leva só o que não for pedido nas perguntas de importação. | Se o token não puder ser pergunta de importação, o Atalho distribuído por link não é viável sem expor segredo: o dono monta o Atalho à mão (documento T9) e **nunca** compartilha um Atalho com token. O modelo de ameaça (seção 12) já assume o pior caso: token legível no aparelho. |

Itens 2 e 6 do G0 (abrir o PWA instalado; aparência da falha de rede) ficam para antes da T9/T10 e não bloqueiam este ADR.

### 12. Modelo de ameaça
| Ameaça | Mitigação | Risco residual |
|---|---|---|
| Token legível no Atalho, no iCloud e no backup do iPhone | Escopo mínimo (só cria gasto e entrada), conta única, expira em 30 dias (máximo 90), revogação por qualquer sessão, rate limit por token e por IP, auditoria por token e filtro `source`, alerta de abuso | Quem desbloqueia o iPhone lê o token. **Sem teto de valor por padrão** (decisão do dono): o pior caso é lançamento falso, de qualquer valor até o limite técnico, até a revogação, estornável pelo app (ledger imutável). **Risco aceito pelo dono** |
| Link iCloud do Atalho compartilhado carregando o token | O Atalho distribuído **nunca** carrega token: token e URL base são perguntas de importação; o dono monta o Atalho dele | Depende da premissa 7 (seção 11) |
| Brute force do token | 256 bits de entropia, lookup por hash, `401` idêntico, rate limit por IP para falhas, alerta de rajada de `401` | Rate limit em memória, zera no restart e é contornável com vários IPs (ADR-003): aceito, coberto pela entropia |
| iPhone perdido ou roubado | Revogar em outro aparelho em Ajustes, Atalhos; expiração curta; rate limit; auditoria por token; estorno pelo app. **Não se conta com o bloqueio do aparelho**: a premissa 1 (se o Atalho roda ou pede Face ID com o aparelho bloqueado) não foi verificada | Janela entre perda e revogação sem teto de valor: **risco aceito pelo dono**, mitigado por revogação, rate limit, auditoria e estorno |
| Segredo em log (aplicação, proxy, borda) | `Authorization` fora de log, `RequestRejectedHandler` e handler de exceções, `Caddyfile` e Cloudflare verificados (T4) | Depende da configuração externa |
| Enumeração de token | `401 QUICK_TOKEN_INVALID` idêntico nos quatro casos | Nenhum conhecido |
| Rota aberta por engano com dois mecanismos de autenticação | `@Order`, matcher exato, variantes de rota e matriz de rotas testadas | Nenhum conhecido |
| Vazamento entre usuários (PR 01 / ADR-032) | `user_id` com FK, FKs compostas `(account_id, user_id)`, gateway de busca por hash sempre com `user_id`, guarda estática do ADR-032, teste com dois usuários de nomes iguais | Nenhum conhecido |
| Teto diário (se ligado) contornado com `date` retroativa | O teto conta pelo instante de criação, não pela `date`; serialização por usuário na transação | Nenhum conhecido |
| Entrada falsa distorce caixa e projeções | Conta única, rate limit, auditoria, estorno pelo app; teto diário de entrada opcional, desligado | Entrada falsa de qualquer valor até a revogação: **risco aceito pelo dono** |
| Valor numérico lido como ponto flutuante | Leitura por texto do JSON em `BigDecimal`, nunca `double`/`float`; mais de 2 casas e notação científica recusadas; teste com `27.6`, `27.605` e `1e3` | Nenhum conhecido |
| Duplicação por batida dupla | Idempotência cobre reenvio, não duas execuções; Q17 | **Risco aceito** pelo dono no MVP (premissa 5) |
| `message` na tela de bloqueio | Só valor formatado e nomes já gravados, nunca `description` | Nome de categoria e de conta aparecem na tela de bloqueio |
| Push do lançamento criado expõe valor e descrição na tela de bloqueio, e um token vazado injeta até 80 caracteres de texto livre no push do dono | Exceção decidida pelo dono (seção 9); descrição limitada e cortada por code point, renderizada como texto puro; limite de 20 chamadas por minuto por token antes de qualquer aviso; fila própria e limitada; revogação do token | Quem pegar o iPhone desbloqueado lê valor e descrição; token vazado envia até 20 pushes por minuto ao dono com texto livre de 80 caracteres: **risco aceito pelo dono**, sem teto por hora |
| Rate limit em memória | Ver ADR-003 | **Risco aceito** |
| Bloqueio por IP atinge o usuário legítimo | O limite de falhas por IP (10 em 5 minutos) é checado antes do token e vale também para token válido; o IPv6 é agrupado por /64 | Atrás de CGNAT de operadora ou no mesmo /64, falhas de terceiros fazem o dono receber `429` por até 5 minutos: **risco aceito** no MVP. Evolução possível: não bloquear token válido conhecido |
| Mapa de falhas por IP lavado por inundação | Memória limitada (10.000 IPs, descarta o mais antigo) | Quem usa muitos IPs expulsa o histórico de outros IPs e afrouxa o limite para eles; não há crescimento de memória: **risco aceito** |
| Limites em memória só valem por instância | `SeenIps` e os limitadores por IP e por token vivem no processo (ADR-001, instância única) | Com mais de uma instância os limites deixam de ser globais e reiniciar zera os contadores; o alerta de IP novo pode repetir uma vez após o restart: **risco aceito** enquanto houver uma instância |
| Caminhos codificados que o container deve barrar | O matcher da cadeia do token e a negação na `apiSecurity` usam o caminho decodificado, sem parâmetros de caminho (`;`) e sem caixa; decodificação inválida é tratada como variante e negada | **Premissa não provada pelo MockMvc**: o Tomcat e o `StrictHttpFirewall` do Spring barram `%2F`, `%5C` e `%00` (e `;`, `//`, `%25`, `%2E`) antes das cadeias. O MockMvc não passa pelo Tomcat, então os testes só provam o que ocorre depois do firewall; se o firewall for relaxado, o teste unitário do matcher cobre `;` e a decodificação inválida. Um teste `RANDOM_PORT` contra o Tomcat real fica como evolução |
| Spam de alertas com muitos IPs | O `SecurityAlertService` limita um push por (usuário, evento) a cada 10 minutos (`moneylog.security.alerts.throttle`, padrão `PT10M`, não alterado em `application.yaml`) | Cada tentativa registra uma linha de log de segurança; o volume depende da rotação de log do host |
| Refatorar o miolo do `CreateTransactionUseCase` | Testes existentes inalterados e critério explícito na T5 | Regressão no lançamento comum, coberta por teste |

## Alternativas recusadas
- **Abrir `/quick` no Safari ou no PWA a partir do Atalho** (opção B): o iOS não abre o PWA instalado por Atalho, e o Safari tem armazenamento separado, então exigiria login extra. Fica para a Fase 2 como complemento, sem ADR até haver caminho.
- **Conta padrão por usuário** (variante Y): tabela, dois endpoints e tela de configuração a mais, e o vazamento alcançaria a conta escolhida pelo usuário. A conta vinculada ao token limita o raio.
- **Reaproveitar o JWT de sessão ou o cookie de refresh**: o Atalho não tem cookie, e aumentaria a vida útil de uma credencial com acesso total.
- **BCrypt para o hash do token**: 256 bits de entropia aleatória não precisam de custo adaptativo; seria latência sem ganho.
- **Ler o número JSON como `double` e arredondar para 2 casas**: esconderia erro de representação (`27.600000000000001`) e abriria caminho para centavo errado. O número é lido pelo texto do JSON, como decimal exato, e mais de 2 casas é recusado.
- **Aceitar `1.234` como mil duzentos e trinta e quatro**: erro de 1000x em dinheiro; a regra segura recusa e pede vírgula.
- **`method` padrão `PIX`**: classificaria em silêncio sem decisão do dono.

## Consequências
- O contrato 2.40.0 ganha `/v1/quick-entry-tokens`, `/v1/quick-entries`, o esquema `quickEntryToken`, `TransactionSource.QUICK_SHORTCUT` e o filtro `source`; só acréscimos. Clientes com `switch` exaustivo sobre `TransactionSource` precisam tratar o valor novo (o front mostra "Atalho").
- A migração seguinte (**V9.28**, reconferir na T2) cria `quick_entry_tokens` e `quick_entry_audit` e troca o `CHECK` de origem. Aditiva; não toca dados nem checksums antigos.
- O ADR-032 e o ADR-012 ganham adendos (revogação por desativação e papel `MEMBER`; mensagem pronta só neste endpoint).
- O dono precisa saber que o Toque nas Costas só existe no iPhone 8 ou mais novo e que o Atalho guarda o token em texto.
- Pendências fora deste ADR: texto do Atalho e roteiro (T9), telas (T7, T8), Fase 2 (`/quick` com fila offline, cartão, lista de categorias do usuário para o Atalho, aviso de expiração, estorno em lote).

## Adendo (2026-10-22): o canal do WhatsApp reaproveita o miolo do atalho (ADR-035)
O lançamento por WhatsApp **não** passa por `POST /v1/quick-entries` nem usa token. O miolo de criação do `CreateQuickEntryUseCaseImpl` (parser `AmountText`, `QuickIdempotencyKey`, um claim de idempotência, `QuickEntryLimits`, mesmo caso de uso de `POST /v1/transactions`) é extraído para um serviço de domínio comum, e o canal tem caso de uso, auditoria (`whatsapp_entry_audit`) e origem (`TransactionSource.WHATSAPP`) próprios. `quick_entry_audit`, `CreateQuickEntryCommand` e os testes do atalho **não mudam**. Os tetos do atalho continuam **desligados por padrão** (Q7); os do canal são próprios e também opcionais e desligados por padrão (ADR-035, seção 9).
