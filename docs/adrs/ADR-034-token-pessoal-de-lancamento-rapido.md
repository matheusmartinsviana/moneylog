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
| Q1 | Dois tipos, `INCOME` (Entrada) e `EXPENSE` (Gasto). "Saída" é gasto. A entrada tem **teto diário próprio e menor** que o do gasto. |
| Q3 | Variante X: a **conta é vinculada ao token** (um token por aparelho e conta). Não há tabela de conta padrão por usuário nem endpoints de configuração. |
| Q5 | `method` nulo quando o Atalho não manda. Nada de `PIX` por chute. |
| Q6 | Regra do valor digitado da seção 6. |
| Q7 | Validade de 30 dias de padrão e 90 de máximo; 3 tokens ativos por usuário; R$ 1.000,00 por lançamento; 30 lançamentos por dia; R$ 3.000,00 por dia em gastos; R$ 1.000,00 por dia em entradas. Todos configuráveis (seção 7). |
| Q8 | Desativar o usuário **revoga o token de vez**; reativar não o ressuscita (token novo); trocar a senha **não** revoga. |
| Q17 | Sem trava de duplicata provável no MVP. |

O teto de entrada (R$ 1.000,00 por dia) é uma **proposta** do agente aprovada em bloco pelo dono como "opção segura"; fica em propriedade e muda sem migração.

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
- **Hash do pedido sobre o input bruto** (`kind`, `amount` como texto, `category`, `description`, `method`, `date` como veio, inclusive ausente). Assim, `date` ausente não vira data resolvida no hash e o reenvio depois da meia-noite do fuso continua sendo replay, não `409`.
- Mesma chave e mesmo input: `201` com o **mesmo `id` e o mesmo `message`** (o `message` é remontado do lançamento gravado). Mesma chave e input diferente: `409 IDEMPOTENCY_KEY_REUSED`. Erro não memoriza a chave. Validade de 24 h.
- **Replay de lançamento estornado**: o replay **não recria** o lançamento e devolve o recurso com o `status` atual (`VOIDED`) e o mesmo `id`. O `message` remontado diz o estado real: "Gasto de R$ 35,50 em Alimentação (Carteira) registrado e depois estornado." (entrada: "Entrada de ... registrada e depois estornada."). Quem quer lançar de novo roda o Atalho outra vez (chave nova).
- A chave protege o **reenvio do mesmo disparo**. Duas execuções manuais com valores digitados são dois lançamentos legítimos; não há trava de duplicata (Q17).
- Chave por data e hora (`yyyyMMddHHmmss`) colide em duas execuções no mesmo segundo: com comandos diferentes é `409`; com comandos iguais é dedupe silencioso. O documento operacional (T9) explica.

### 6. Valor digitado (Q6) e moeda
Moeda BRL. O Atalho manda o valor como **texto**; o parser vive no backend, sem `double` nem `float`, e produz o `AmountInput` canônico antes de chamar o caso de uso. `POST /v1/transactions` continua estrito. Regra:
- Remover `R$` e espaços.
- Se há vírgula, ela é o decimal (1 ou 2 casas) e os pontos antes dela são milhar, em grupos de 3.
- Sem vírgula, o ponto só é decimal com **1 ou 2 casas depois**. Ponto seguido de 3 ou mais dígitos sem vírgula é **ambíguo** e vira `422 QUICK_AMOUNT_AMBIGUOUS` ("Use vírgula nos centavos, por exemplo 1.234,00").
- Mais de 2 casas decimais, zero, negativo, vazio ou letras: `422 QUICK_AMOUNT_INVALID`.

Tabela de casos (fixada aqui e testada na T5, inclusive com teste de propriedade: todo centavo formatado e parseado volta igual):

| Entrada | Resultado |
|---|---|
| `35` · `35,5` · `35,50` · `1,5` | 35.00 · 35.50 · 35.50 · 1.50 |
| `1.234,56` · `1.234.567,89` · `R$ 35,00` | 1234.56 · 1234567.89 · 35.00 |
| `35.50` · `35.5` | 35.50 · 35.50 |
| `1.234` · `35.500` · `1.234.567` | `QUICK_AMOUNT_AMBIGUOUS` (422, "use vírgula nos centavos") |
| `10,005` · `1,234,56` · `12.34,56` | `QUICK_AMOUNT_INVALID` |
| `0` · `0,00` · `-5` · vazio · `abc` | `QUICK_AMOUNT_INVALID` |
| acima de R$ 999.999.999,99 ou do teto do token | `QUICK_AMOUNT_INVALID` / `QUICK_LIMIT_REACHED` |

`amount` numérico (JSON) é `400`.

### 7. Tetos (Q7) e propriedades
| Teto | Valor | Propriedade proposta (`moneylog.quick-entry.*`) |
|---|---|---|
| Validade padrão / máxima do token | 30 / 90 dias | `default-validity-days` / `max-validity-days` |
| Tokens ativos por usuário | 3 | `max-active-tokens` |
| Valor por lançamento | R$ 1.000,00 | `max-amount` |
| Lançamentos por dia | 30 | `max-entries-per-day` |
| Valor total de gastos por dia | R$ 3.000,00 | `max-expense-per-day` |
| Valor total de entradas por dia | R$ 1.000,00 | `max-income-per-day` |

O "dia" do teto diário é definido pelo **instante de criação** (`createdAt` do lançamento, ou `quick_entry_audit.created_at`), convertido no fuso do usuário (`users.time_zone`), **nunca pela `date` do lançamento**. Contar pela `date` daria um balde por dia dos 366 dias retroativos e anularia o teto (um token vazado lançaria R$ 3.000 para cada dia do último ano e reescreveria meses fechados). O teto conta só lançamentos **ativos** (estornados saem da conta). A `date` retroativa continua permitida até 366 dias, mas consome o teto do dia em que foi criada. A quantidade vale para os dois tipos juntos; os totais são separados por tipo. Qualquer teto estourado: `422 QUICK_LIMIT_REACHED`, nada gravado, e o `detail` diz qual. Os totais e a quantidade do dia valem **por usuário** (somando todos os tokens dele), para que gerar mais tokens não multiplique o teto.

**Serialização obrigatória.** A conferência "soma do dia mais o novo valor contra o teto" e a gravação do lançamento acontecem na mesma transação do claim de idempotência, sob **lock por usuário** (`SELECT ... FOR UPDATE` na linha do usuário ou advisory lock por `user_id`), para que requisições paralelas, que o rate limit por minuto permite, não ultrapassem quantidade nem valor. A T5 ganha teste paralelo de teto. Os nomes das propriedades e os limites de rate limit (seção 4) são proposta técnica e podem mudar na T3/T4.

### 8. Categoria, data e método
- **`category` é opcional** (fluxo do Atalho: tipo, nome e valor). Omitida, a movimentação **recebe a categoria de sistema padrão**, `OTHER_EXPENSE` (gasto) ou `OTHER_INCOME` (entrada), a mesma regra de `categoryId` ausente em `POST /v1/transactions` (contrato 2.11.0). Nunca fica sem categoria, o que respeita o domínio atual (consumo por categoria no dashboard e nos relatórios exige categoria), e a resposta traz a categoria aplicada (`QuickEntryResult.category` não é nulo). Se a categoria padrão não existir ou estiver arquivada, vale o erro existente `422 DEFAULT_CATEGORY_UNAVAILABLE`, sem gravar. Enviada: chave de sistema (`FOOD`) ou nome sem acento e sem caixa, entre as categorias **ativas do próprio usuário**; nunca por id. Inexistente, arquivada ou de outro usuário: `422 QUICK_CATEGORY_NOT_FOUND`, sem classificar em silêncio.
- `date` omitida = hoje no fuso do usuário; aceita de hoje menos 366 dias até hoje; futura ou mais antiga é `422 QUICK_DATE_OUT_OF_RANGE`. A hora não é gravada (a movimentação guarda só a data; `createdAt` guarda o instante).
- `method` é opcional, só do gasto, e fica nulo se omitido (Q5). Enviado numa entrada, é `400 VALIDATION_FAILED` (decisão técnica do contrato: ignorar em silêncio esconderia erro do Atalho).
- Fora do MVP: compra no cartão, transferência, investimento, empréstimo, parcelado, estorno, edição e exclusão pelo token. O `kind` é enum fechado.

### 9. Resposta pensada para o Atalho (exceção ao ADR-012)
O Atalho não traduz código de erro e "Obter conteúdo de URL" não falha em `4xx/5xx` (premissa, seção 11). Por isso, **só neste endpoint**, o `201` traz `message` e os erros trazem `detail` em português pronto para a notificação. É uma exceção a "o backend não grava frase pronta" do ADR-012; as demais rotas não mudam.
- O `message` usa **apenas valor formatado pelo backend e nomes já gravados** (categoria e conta). **Nunca ecoa `description`** nem texto livre digitado, porque a notificação do iOS aparece na tela de bloqueio. Exemplo: "Gasto de R$ 35,50 em Alimentação (Carteira) registrado.".
- A formatação de moeda pt-BR neste texto é lógica do backend, restrita a este endpoint. Valores continuam `Money` na resposta.
- A resposta de sucesso não traz saldo nem lista de contas ou categorias.

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
| 3 | O valor pode chegar ao corpo como texto **com vírgula, com ponto ou com separador de milhar**, dependendo de como o "Pedir Entrada" numérico formata `35,5`, `1234,56` e `1.234,56`. A regra da seção 6 foi desenhada para aceitar as três formas e recusar o ambíguo. | Se sair sempre com ponto decimal e sem milhar, a regra continua correta e o `QUICK_AMOUNT_AMBIGUOUS` quase não ocorre. Se sair em formato que a regra recusa (por exemplo milhar com ponto e centavos com ponto), o Atalho passa a usar "Pedir Entrada" de texto e o documento operacional ensina o formato; a regra do backend não afrouxa (risco de erro de 1000x). |
| 4 | **Premissa, não confirmada:** supõe-se que o Atalho não tenha ação nativa de UUID, e que a ação de número aleatório, se existir, não esteja garantida. Por isso a `Idempotency-Key` é planejada a partir de data e hora (`yyyyMMddHHmmss`) e o contrato aceita `[A-Za-z0-9_-]{8,64}`, não só UUID. | Se existir ação aleatória, o Atalho acrescenta sufixo aleatório e reduz a colisão no mesmo segundo; o contrato já aceita (nenhuma mudança). Se o Atalho só conseguir chave fraca, a proteção contra reenvio continua valendo, mas colisões geram `409` confuso (explicado no documento operacional). |
| 5 | **O Toque Duplo pode disparar o Atalho duas vezes** (ou duas execuções simultâneas). A idempotência por chave **não** cobre isso, porque cada execução pede o valor de novo. | Sem trava de duplicata (Q17), uma batida dupla pode gerar dois lançamentos. Se o teste real mostrar que ocorre, a decisão volta ao dono (trava de mesmo valor, tipo e categoria em N segundos, ou aviso). O estorno pelo app e o filtro `source` são a mitigação. |
| 7 | "Perguntas de importação" aceitam o token e a URL base, e **o token fica em texto claro dentro do Atalho já importado**, legível por quem desbloqueia o iPhone, e vai para iCloud e backup. O link iCloud compartilhado leva só o que não for pedido nas perguntas de importação. | Se o token não puder ser pergunta de importação, o Atalho distribuído por link não é viável sem expor segredo: o dono monta o Atalho à mão (documento T9) e **nunca** compartilha um Atalho com token. O modelo de ameaça (seção 12) já assume o pior caso: token legível no aparelho. |

Itens 2 e 6 do G0 (abrir o PWA instalado; aparência da falha de rede) ficam para antes da T9/T10 e não bloqueiam este ADR.

### 12. Modelo de ameaça
| Ameaça | Mitigação | Risco residual |
|---|---|---|
| Token legível no Atalho, no iCloud e no backup do iPhone | Escopo mínimo (só cria gasto e entrada), conta única, expira em 30 dias (máximo 90), revogação por qualquer sessão, tetos por lançamento e por dia (entrada menor), auditoria por token e filtro `source`, alerta de abuso | Quem desbloqueia o iPhone lê o token. O pior caso é lançamento falso até a revogação, estornável pelo app (ledger imutável) |
| Link iCloud do Atalho compartilhado carregando o token | O Atalho distribuído **nunca** carrega token: token e URL base são perguntas de importação; o dono monta o Atalho dele | Depende da premissa 7 (seção 11) |
| Brute force do token | 256 bits de entropia, lookup por hash, `401` idêntico, rate limit por IP para falhas, alerta de rajada de `401` | Rate limit em memória, zera no restart e é contornável com vários IPs (ADR-003): aceito, coberto pela entropia |
| iPhone perdido ou roubado | Revogar em outro aparelho em Ajustes, Atalhos; expiração curta; tetos. **Não se conta com o bloqueio do aparelho**: a premissa 1 (se o Atalho roda ou pede Face ID com o aparelho bloqueado) não foi verificada | Janela entre perda e revogação, limitada aos tetos |
| Segredo em log (aplicação, proxy, borda) | `Authorization` fora de log, `RequestRejectedHandler` e handler de exceções, `Caddyfile` e Cloudflare verificados (T4) | Depende da configuração externa |
| Enumeração de token | `401 QUICK_TOKEN_INVALID` idêntico nos quatro casos | Nenhum conhecido |
| Rota aberta por engano com dois mecanismos de autenticação | `@Order`, matcher exato, variantes de rota e matriz de rotas testadas | Nenhum conhecido |
| Vazamento entre usuários (PR 01 / ADR-032) | `user_id` com FK, FKs compostas `(account_id, user_id)`, gateway de busca por hash sempre com `user_id`, guarda estática do ADR-032, teste com dois usuários de nomes iguais | Nenhum conhecido |
| Teto diário contornado com `date` retroativa | O teto conta pelo instante de criação, não pela `date`; serialização por usuário na transação | Nenhum conhecido |
| Entrada falsa distorce caixa e projeções | Teto diário de entrada menor (Q1/Q7), conta única, estorno pelo app | Entrada falsa dentro do teto até a revogação |
| Duplicação por batida dupla | Idempotência cobre reenvio, não duas execuções; Q17 | **Risco aceito** pelo dono no MVP (premissa 5) |
| `message` na tela de bloqueio | Só valor formatado e nomes já gravados, nunca `description` | Nome de categoria e de conta aparecem na tela de bloqueio |
| Rate limit em memória | Ver ADR-003 | **Risco aceito** |
| Refatorar o miolo do `CreateTransactionUseCase` | Testes existentes inalterados e critério explícito na T5 | Regressão no lançamento comum, coberta por teste |

## Alternativas recusadas
- **Abrir `/quick` no Safari ou no PWA a partir do Atalho** (opção B): o iOS não abre o PWA instalado por Atalho, e o Safari tem armazenamento separado, então exigiria login extra. Fica para a Fase 2 como complemento, sem ADR até haver caminho.
- **Conta padrão por usuário** (variante Y): tabela, dois endpoints e tela de configuração a mais, e o vazamento alcançaria a conta escolhida pelo usuário. A conta vinculada ao token limita o raio.
- **Reaproveitar o JWT de sessão ou o cookie de refresh**: o Atalho não tem cookie, e aumentaria a vida útil de uma credencial com acesso total.
- **BCrypt para o hash do token**: 256 bits de entropia aleatória não precisam de custo adaptativo; seria latência sem ganho.
- **Aceitar `1.234` como mil duzentos e trinta e quatro**: erro de 1000x em dinheiro; a regra segura recusa e pede vírgula.
- **`method` padrão `PIX`**: classificaria em silêncio sem decisão do dono.

## Consequências
- O contrato 2.40.0 ganha `/v1/quick-entry-tokens`, `/v1/quick-entries`, o esquema `quickEntryToken`, `TransactionSource.QUICK_SHORTCUT` e o filtro `source`; só acréscimos. Clientes com `switch` exaustivo sobre `TransactionSource` precisam tratar o valor novo (o front mostra "Atalho").
- A migração seguinte (**V9.28**, reconferir na T2) cria `quick_entry_tokens` e `quick_entry_audit` e troca o `CHECK` de origem. Aditiva; não toca dados nem checksums antigos.
- O ADR-032 e o ADR-012 ganham adendos (revogação por desativação e papel `MEMBER`; mensagem pronta só neste endpoint).
- O dono precisa saber que o Toque nas Costas só existe no iPhone 8 ou mais novo e que o Atalho guarda o token em texto.
- Pendências fora deste ADR: texto do Atalho e roteiro (T9), telas (T7, T8), Fase 2 (`/quick` com fila offline, cartão, lista de categorias do usuário para o Atalho, aviso de expiração, estorno em lote).
