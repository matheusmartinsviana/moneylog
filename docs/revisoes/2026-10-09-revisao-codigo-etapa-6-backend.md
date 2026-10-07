---
revisao: código do backend da Etapa 6 (vault de notas Markdown, T106 a T112)
data: 2026-10-09
revisor: revisor
escopo: backend/ (core.note, infra.note, NoteConfig, V6.00, V6.01, FlywayMigrationIT.naoDeveApagarDados) e contracts/openapi.yaml 2.5.0
referencias: docs/planos/2026-10-05-etapa-6-vault-notas.md; docs/adrs/ADR-009-vault-de-notas-markdown.md; ADR-008; docs/revisoes/2026-10-05-revisao-planos-etapas-3-9.md; D1 §8 (S-157/158/160, S-24, S-48, S-265 a S-270); PR 00
---

# Revisão de código: Etapa 6 (backend)

## 1. Resumo

O vault está bem construído nos pontos que quebram em produção por construção: o zip nunca vai para disco, os limites são contados ao ler (não pelo cabeçalho), o nome hostil aborta o zip inteiro antes de gravar uma linha, o YAML é lido com `SafeConstructor`, sem aliases e com limites, a escrita é uma transação só, e as notas **não** tocam o razão (nenhum `FinancialRecords`, nenhum lock ou `UPDATE` em tabela financeira; o único acoplamento é leitura de rótulos e as FKs compostas). Os vínculos têm FK composta `(id, user_id)` em todos os alvos, CHECK de uma única referência e `CASCADE` só onde faz sentido.

Não encontrei defeito **crítico** (🔴). Há **quatro 🟠**: um custo quadrático no leitor de tags que dá ~12,6 s de CPU numa nota de 200 KB (segura transação, conexão e a trava do vault), strings vindas do frontmatter sem validação de caracteres de controle (um `\0` vira 500 e derruba a importação inteira), o limite de 100 tags não vale para as tags do frontmatter (medi 3.000), e `refreshWikilinks` que carrega todos os wikilinks do usuário a cada escrita (escala mal nos limites declarados). O restante são 🟡/🟢.

**Verificação**: numa cópia isolada de `backend/` rodei `ArchitectureTest`, `Note*Test`, `Wikilink*Test`, `FrontmatterTest`, `MarkdownCodeTest`, `VaultZipReaderTest`, `VaultImportExportTest` e `NoteUseCasesTest` (verdes). Não rodei os ITs (Testcontainers) para não competir com o tester; li `VaultIT`, `NotesIT`, `NoteConcurrencyIT`, `VaultUploadLimitIT`. Além disso **executei sondas** contra as classes do `core.note` compiladas: zips construídos com Python (bomb, truncados, slip, nomes longos, CP437, aninhado, symlink, duplicatas de caixa/NFD) passados ao `VaultZipReader.scan`, e textos hostis passados ao `NoteContent.analyze`/`NotePath.of`/`WikilinkRewriter` (resultados citados nos achados).

Observação: o S-270 do D1 é a **trava de vault**, não o zip truncado; o zip cortado na fronteira de uma entrada é uma limitação já registrada no ADR-009 §6 (ver 🟡 A5).

## 2. Itens conformes

**Zip (superfície de ataque)**

- Zip slip: `requireSafeName` roda em **toda** entrada (inclusive as ignoradas) antes de qualquer gravação: `..`, `.`, `/` inicial, letra de unidade, `\`, controle ISO → `VAULT_IMPORT_INVALID`; `NotePath.of` repete a checagem depois do NFC. Sonda: `a/../../x.md` aborta o zip inteiro (`slip.zip`). Nada é extraído, então symlink e "nome Unicode enganoso" não têm onde produzir efeito; bidi/largura zero/formatação são recusados em nome de nota (`FORBIDDEN_CHARACTER`) e o `.md` com RLO vira `PATH_UNSUPPORTED` (ignorado, relatado).
- Zip bomb: limite contado em `readBounded` (bytes lidos, não o cabeçalho), orçamento restante por entrada, 100 MB total, 2.000 entradas (contadas antes de olhar o nome), 20 MB enviados (`source.size()`) e 200 KB por nota (o excedente é drenado sem reter). Sonda: 100 MB+10 de zeros em 102 KB abortam em ~80 ms com `VAULT_IMPORT_TOO_LARGE`. Zip dentro de zip não é aberto (`NOT_MARKDOWN`); symlink é só um arquivo com o texto do alvo.
- Duplicatas na mesma importação: a chave `path.key()` (NFC + minúscula) é atualizada a cada nota criada, então `A.md`/`a.MD` e `café.md` NFC/NFD caem no conflito (SKIP ou RENAME), nunca em violação do índice único (sonda `mix.zip`: 5 notas lidas, conflito resolvido na gravação). Nomes reservados do Windows (`con`, `aux.txt.md`, `nul`) são ignorados com aviso.
- Truncamento no meio de uma entrada: recusado (sonda `trunc_mid2.zip`); CRC conferido ao fim da entrada.
- Leitura em fluxo: uma nota por vez em memória (≤ 200 KB), duas passadas; o upload fica em disco temporário do container (multipart com `file-size-threshold` padrão 0). `max-file-size 21MB`/`max-request-size 22MB`/`max-swallow-size 30MB` e o handler de `MaxUploadSizeExceededException` dão 422 `VAULT_IMPORT_TOO_LARGE` (coberto por `VaultUploadLimitIT` com servidor real).
- Importação tudo ou nada: `TransactionalProxies.required` + `NoteLimitReachedException` relançada + exceção de infra → rollback. `mode` só tem `SKIP` e `RENAME`: nenhum modo sobrescreve, então não há perda de dados por conflito.
- YAML: `SafeConstructor`, `maxAliasesForCollections=0`, `codePointLimit` 64 KB, `nestingDepthLimit` 8, chave duplicada recusada, `StackOverflowError` capturado. Sondas: alias, `<<` merge e `!!javax.script...` viram `FRONTMATTER_INVALID` (a nota entra sem o frontmatter); âncora sem alias passa (inofensivo). `1e999999` e inteiro gigante não quebram.
- Markdown/HTML: o backend nunca interpreta, remove ou reescreve HTML; saída é JSON (`application/json`); `X-Content-Type-Options: nosniff` vem do Spring Security e é testado (`NotesIT:208`, `SecurityMatrixQaIT:284`); a exportação é `application/zip` com `Content-Disposition` de nome fixo e `Cache-Control: no-store`. Trechos de busca/backlink são texto puro. O que o backend deve garantir está feito; o resto (renderizar sem HTML bruto, escapar `ignoredFiles`/`warnings`, que trazem nomes do zip) é do frontend.

**Integridade e isolamento**

- Nada em `FinancialRecords`; `NoteTargetGatewayImpl` só faz `SELECT` filtrado por `user_id` (confirmado: nenhum `import` de `core.finance` em `core.note`; o único `core.transaction` usado é `IdempotentClaim`). Uma nota nunca trava ou grava movimentação/conta, então a ordem de travas da ADR-008 não é afetada: a trava de vault (`pg_advisory_xact_lock`, chave `NAMESPACE ^ msb ^ lsb`) é a primeira e única de uso exclusivo das notas.
- V6.00: FKs compostas `(note_id,user_id)` e uma por alvo (`transactions`, `accounts`, `credit_cards`, `credit_card_invoices`, `persons`, `debts`, `goals`, `notes`), `ck_note_links_column_matches_type`, `ck_note_links_wikilink`, `ck_note_links_explicit_single_reference` (`num_nonnulls = 1`), formato `AAAA-MM`, `CASCADE` só em `note_tags`, `note_links.note_id` e na fatura vazia (S-267), FK de nota-alvo `DEFERRABLE` para a importação, índice único parcial `(user_id, path_key) WHERE deleted_at IS NULL` (lixeira não impede recriar; restaurar com conflito → `NOTE_PATH_TAKEN` em `RestoreNoteUseCaseImpl:27`).
- Importação não vaza: `moneylog.links` com id de outro usuário não é encontrado em `targets.describe(userId, …)` e vira vínculo **pendente** (guarda só o texto recebido).
- `version`: Update, Move e Links comparam `version` sob a trava; `ObjectOptimisticLockingFailureException` → 409 `VERSION_CONFLICT`; `isLockFailure` mapeia 40P01/55P03/40001 para 409 `CONFLICT` com `Retry-After` (S-270). `Idempotency-Key` opcional na criação (reivindicada na mesma transação, hash do comando); trash/restore/esvaziar são idempotentes por estado.
- `deleteTrashed` apaga primeiro os `note_links` que apontam para as notas da lixeira (a FK de nota-alvo não tem cascade), então não há 500 por FK ao esvaziar.
- JDBC: tudo parametrizado; o único SQL montado por concatenação usa **colunas de enum** (`linkedClause`) e `ORDER BY` de `switch` sobre enum. `escapeLike` escapa `\`, `%`, `_` (termo e pasta); `unaccent` é "trusted" no PG 13+, então o `CREATE EXTENSION` do dono do banco (Flyway com o usuário mestre do RDS) funciona; a imagem de teste é `postgres:17`.
- Reescrita de wikilinks: só links que **resolviam para a nota movida** antes da mudança (`before.resolve(link).filter(moved.id)`), preservando alias, seção, embed e forma (nome/caminho/`.md`), garantindo que o novo alvo resolve para a nota certa (`newTarget` cai para o caminho completo em caso de empate) e tudo na mesma transação; homônimas intactas. Sonda: `[[A\|b]]`, `![[A#h|s]]`, `[[ A | x ]]` reescritos só no alvo; crases e cerca de código preservadas.

**Contrato/arquitetura**

- 2.5.0 é aditivo (rotas novas). `additionalProperties: false` + `fail-on-unknown-properties` (400 `UNKNOWN_FIELD`), `@NoControlChars(allowLineBreaks=true)` (400) e `NoteContent.validateText` (422 na importação). `GET /v1/notes` não devolve corpo; `Note` (com `body`) sai em criar/ler/editar/mover/lixeira/restaurar. Multipart só validado na resposta é aceitável: o corpo do formulário é um único arquivo e o caso de uso aplica todos os limites e códigos; o contrato descreve os 422/409/429 e o parâmetro `mode` na query.
- `FlywayMigrationIT.naoDeveApagarDados`: remover `ON DELETE CASCADE` antes de procurar `DELETE ` é legítimo (é regra de FK, não comando) e continua pegando `DELETE FROM`, `DROP`, `TRUNCATE`.
- ArchUnit verde; `snakeyaml` (versão da BOM do Spring Boot, 2.6) só é usado em `core.note.domain.Frontmatter`.
- Testes: `VaultZipReaderTest`/`VaultIT` cobrem bomb, slip, limites, truncado, encoding, concorrência; `NoteConcurrencyIT` cobre 8 criações do mesmo caminho, edição × criação do alvo e mistura de operações sem 5xx nem link órfão.

## 3. Achados

### 🟠 Alto

**A1. Custo quadrático em `NoteTags.extract`: ~12,6 s de CPU numa nota de 200 KB**

- `core/note/domain/NoteTags.java:59` e `:76-83`: para cada `#` fora de código, `insideLink` varre **todos** os wikilinks da nota; o corpo traz 20.000 `[[a]]` e 50.000 ` #` (cabe nos 200 KB). Medido: `NoteContent.analyze` leva **12.659 ms**. O mesmo caminho roda em criar, editar, **reescrita de outras notas ao renomear** e importação (até 2.000 notas), tudo dentro da transação, com a conexão do pool e a trava do vault do usuário; poucas requisições paralelas esgotam o pool (Hikari padrão) e travam o app para os outros usuários. `WikilinkParser.parse` também devolve todos os wikilinks (o limite de 500 só é aplicado depois, em `Note.applyBody`).
- Correção: os wikilinks vêm em ordem crescente e sem sobreposição: use busca binária (como `MarkdownCode.rangeAt`) ou um ponteiro que avança junto com `hash`; teste de desempenho com esse corpus (< 100 ms). Opcional: parar de coletar wikilinks depois de, por exemplo, 5×`MAX_WIKILINKS` distintos.

**A2. Strings do frontmatter sem validação de controle: `\0` vira 500; título com ESC/bidi é gravado**

- `core/note/domain/NoteContent.java:27` (`title` do frontmatter só passa por `cap`), `Frontmatter.java:114-121` (`scalar` de `moneylog.links`), `ImportVaultUseCaseImpl.java:226` e `:236` (`NoteLink.pending(type, ref.id())` e `ref.path()`). O corpo é validado (`requireClean`), mas o YAML permite `"a\0b"`, `"\x1b"`, `"‮"` por escape. Medido: `title: "a\0b"` é aceito e o título guarda NUL; o Postgres recusa `\0` em `varchar` (22021), então `POST/PUT /v1/notes` e a **importação inteira** respondem 500 (e a importação desfaz tudo por causa de uma nota); ESC e RLO passam e chegam ao `title` e ao `target_text` exibidos pelo front.
- Correção: validar o título (sem controle, uma linha, sem caracteres `FORMAT`/separadores; senão cair para o nome do arquivo ou 422) em `NoteContent.analyze`; na importação, descartar o vínculo com `LINK_IGNORED` quando `id`/`path`/`key` tiver controle ou formatação (reaproveitar `PlainText`). Teste: título e `moneylog.links` com `\0`, `\x1b`, `‮` pela API e pela importação (esperado 422 / aviso, nunca 500).

**A3. O limite de 100 tags (S-268) não vale para o frontmatter**

- `core/note/domain/NoteTags.java:42-44`: o laço de `frontmatterTags` adiciona sem teto; só o laço do corpo respeita `MAX_TAGS`. Medido: frontmatter com 3.000 itens em `tags:` grava **3.000** tags (60 KB de frontmatter bastam). O DB não tem teto (`note_tags`) e `Note.applyBody:133` copia o conjunto como veio. `NoteTextPropertyTest.deveSerRobusto` passa `List.of()` no lugar das tags do frontmatter, então não pega.
- Correção: aplicar `MAX_TAGS` ao conjunto final (frontmatter primeiro, corpo depois) ou recusar com `NOTE_TAG_LIMIT`; incluir o caso no teste de propriedade.

**A4. `VaultIndex.refreshWikilinks` carrega todos os wikilinks do usuário a cada escrita**

- `core/note/app/VaultIndex.java:24-36` + `NoteGatewayImpl.java:228-232` (`SELECT … FROM note_links WHERE user_id = ? AND origin = 'WIKILINK'`, sem índice por `user_id`/`origin`): chamado em criar, mover, lixeira, restaurar e importar. Nos limites declarados (5.000 notas × até 500 wikilinks) são milhões de linhas, cada uma com `TextFolding.fold` (NFD + lowercase + NFC) só para descobrir que nada mudou. É estimativa, não medi nesse volume; o plano já mediu 4,4 s para renomear com 500 notas. O uso típico é pequeno, mas o limite que o produto anuncia é 5.000 notas.
- Correção: recalcular só os links cujo nome dobrado coincide com o das notas afetadas (guardar `target_fold` e indexar `(user_id, target_fold)`, ou carregar só os de `target_note_id IS NULL` + os que apontavam para a nota que saiu); ao menos criar `CREATE INDEX … ON note_links (user_id) WHERE origin = 'WIKILINK'`. Registrar a medição de 5.000 notas como teste de limite.

### 🟡 Médio

**M1. Importação: nomes de arquivo sem teto entram no relatório** (`VaultZipReader.java:162-183`, `ImportVaultUseCaseImpl.java:58-65`, `ImportReport`). O nome de uma entrada pode ter até 64 KB; um zip de 20 MB com ~300 desses vira centenas de MB de `String` e uma resposta de dezenas de MB (um `.md` com nome enorme entra em `ignoredFiles` **e** em `warnings`). Corrigir: nome acima de 255 caracteres → `PATH_UNSUPPORTED` sem ecoar o nome inteiro, e limitar as listas do relatório (primeiros N + contagem). O front precisa escapar esses nomes.

**M2. Zip de Windows com nomes CP437/CP850 (sem a flag UTF-8) é recusado inteiro** (`VaultZipReader.java:81-82,116`). Medido: um zip com `caf\x82.md` → `VAULT_IMPORT_INVALID: não foi possível ler o zip`. É falso positivo de segurança que bloqueia um caso real de usuário. Corrigir: decodificar com fallback (CP437/ISO-8859-1) quando a flag não está ligada, ou pelo menos mensagem própria ("nomes em codificação antiga; recompacte em UTF-8").

**M3. Reimportar com `RENAME` não é idempotente** (`ImportVaultUseCaseImpl.java:103-116`). O contrato diz que `SKIP` é idempotente e por isso não há `Idempotency-Key`, mas `RENAME` duplica tudo a cada envio (`nome (2)`, `(3)`…), e o duplo clique é o caso comum. Corrigir: documentar na UI/contrato e desabilitar o botão, ou aceitar `Idempotency-Key` opcional também aqui (guardando o relatório).

**M4. Reescrita ao renomear pode falhar com `NOTE_TOO_LARGE` e abortar o rename** (`MoveNoteUseCaseImpl.java:64-67`, `Note.rewriteBody` → `NoteContent.analyze`). Uma nota perto de 200 KB com muitos links para a nota renomeada passa do limite com o nome mais longo. A transação desfaz (correto), mas o usuário recebe 422 de uma nota que não é a que ele editou. Corrigir: mensagem/`code` que cite a nota (`rewrittenNotes`) ou limite de nome que garanta folga; teste.

**M5. Links dentro de bloco de código indentado (4 espaços) são reescritos** (`MarkdownCode.java` só reconhece cerca e crase). Sonda: `    [[A]] indented code` → `    [[Z]] …`. O Obsidian trata como código. Os links em `%% … %%`, `<!-- -->` e `$…$` também são reescritos (aceitável, mas diga). Corrigir: reconhecer o bloco indentado (após linha em branco e fora de lista) ou documentar a limitação no ADR-009.

**M6. Chave `moneylog` com formato fora do esperado derruba a nota importada** (`Frontmatter.isMoneylogKeyLine`, `:260-263`): `"moneylog":`, `moneylog :` ou `? moneylog` são detectadas pelo YAML (`hasMoneylogKey`) mas não removidas do texto, e `Note.create` recusa com `NOTE_FRONTMATTER_RESERVED`; a nota some com aviso. Segurança ok; só perda de uma nota por forma de escrita. Alternativa: descartar o bloco inteiro (`dropBlock`) com `FRONTMATTER_INVALID`, como nos demais casos.

**M7. `core.note` ficou com dependência de biblioteca de terceiros e a regra do ArchUnit não a cobre** (`Frontmatter.java:10-12`; `ArchitectureTest.java:27-37` proíbe Spring, JPA, Hibernate, Jackson e Lombok mas não `org.yaml`). O core "Java puro" (BE 01) abre exceção para YAML sem registro: ou se declara a exceção (regra que só permite `org.yaml..` em `core.note.domain.Frontmatter`, com o ADR-009 citado) ou se isola atrás de uma porta. Também `core.note` usa `core.transaction.app.IdempotentClaim`/`IdempotencyGateway` (sem ciclo, mas acopla features; o lugar natural seria `core.sk`).

**M8. Teste de propriedade que passa mesmo se o código de bloco for reescrito** (`NoteTextPropertyTest.deveSerFielNaReescrita`). "Renomear e voltar" devolve o texto original mesmo que o rewriter tocasse links em código (as duas direções tocariam igual), e `stripLinks` usa o mesmo `WikilinkParser`. A garantia "links em código nunca mudam" fica só nos exemplos de `WikilinkRewriterTest`. Corrigir: comparar com um oráculo independente (extrair os trechos de código do texto original por regex simples e exigir igualdade byte a byte nesses trechos após a reescrita).

**M9. Exportação em fluxo sem sinal de falha** (`VaultController.java:51-57`, `ExportVaultUseCaseImpl.java:48-62`): o cabeçalho 200 já saiu quando um lote falha, e o cliente recebe um zip cortado (sem diretório central) que parece um download normal; as leituras em lotes de 50 também não compartilham um snapshot. Aceitável para o MVP; registre no ADR ou escreva um arquivo final (`.moneylog-manifest`) com a contagem.

### 🟢 Baixo

- **A5 (resposta à pergunta do zip truncado na fronteira).** `VaultZipReader.java:110-113`: o leitor em fluxo não vê o diretório central; sonda `trunc_boundary.zip` (3 entradas, sem diretório central) e `trunc_after2.zip` (corte após a 2ª) **são aceitos** e importam as entradas íntegras, sem aviso. Do ponto de vista de segurança é aceitável (tudo continua limitado e validado) e já está no ADR-009 §6; do ponto de vista do usuário, um vault cortado parece importado por inteiro. Correção barata: o upload está em disco, então ler o EOCD (últimos 22 bytes+comentário) e comparar o número de entradas com o contado, ou ao menos devolver um `warning` `ZIP_INCOMPLETE`.
- Nomes reservados do Windows incompletos (`NotePath.java:24-25,107-110`): `CON .md` (espaço antes da extensão), `COM¹/²/³`, `LPT¹/²/³` passam (sonda). Um vault exportado para o Windows pode não abrir esses arquivos.
- `NoteGatewayImpl.java:228`: `wikilinks(userId)` e `noteIdsLinkingTo` filtram por `user_id`/`target_note_id` sem índice cobrindo `origin='WIKILINK'` (há `ix_note_links_user_target_note`, que serve o segundo).
- A validação de caminho/zip roda **dentro** da transação e depois da trava de vault (`ImportVaultUseCaseImpl.java:54-56`): um zip hostil/enorme segura a trava por até a leitura de 100 MB. Dá para fazer a primeira passada antes de abrir a transação.
- Sem teto de corpo JSON na criação/edição (o Jackson limita a string a ~20 M de caracteres; a validação de 200 KB vem depois do parse). Considere um filtro de `Content-Length` para `/v1/notes` (~1 MB).
- Wikilinks em propriedades do frontmatter (`related: "[[X]]"`) não são lidos nem reescritos ao renomear (o Obsidian reescreve). Documente.
- Deadlock raro: o `DELETE` de uma fatura vazia (cascade em `note_links`) concorrendo com a gravação de uma nota que a referencia pode formar ciclo entre a linha da fatura e `note_links`; o Postgres derruba uma das duas e o `GlobalExceptionHandler` devolve 409 `CONFLICT`. Sem ação, só ciente.
- `search` com `unaccent(n.body) ILIKE` faz varredura sequencial por usuário (≈150 ms com 2.000 notas, medido no ADR); com 5.000 notas de 200 KB o pior caso é ~1 GB de texto por busca. Observar em produção; `pg_trgm` só se necessário.
- `NoteGatewayImpl.save` regrava tags e links por inteiro (6+ consultas por nota): a importação de 2.000 notas faz ~12 mil consultas; ok para o limite.

## 4. Riscos

- Os 🟠 A1 e A2 são alcançáveis por qualquer usuário autenticado (e A2 também por um vault legítimo com um caractere estranho no `title`): corrigir antes de abrir o vault a mais de um usuário.
- A4 só aparece com vault grande; vale medir 5.000 notas × 500 links antes do deploy na instância pequena (ADR-001).
- RDS: `CREATE EXTENSION unaccent` funciona com o usuário mestre (extensão "trusted" desde o PG 13); se o Flyway rodar com um usuário sem `CREATE` no banco, V6.01 falha na subida. Confirmar o usuário de migração no deploy e a versão do RDS (≥ 13).
- Rate limit de importação/exportação é em memória (uma instância), como já registrado na Etapa 5.

## 5. Pendências por dono

- **Backend**: A1, A2, A3, A4; M1 a M6, M9; os 🟢 que fizerem sentido (EOCD, índice, reservados do Windows).
- **Arquitetura**: M7 (exceção declarada para `org.yaml` e local do `IdempotentClaim`); registrar no ADR-009 a decisão sobre indentado/comentários (M5) e wikilinks em propriedades.
- **Produto**: M2 (aceitar zips de Windows antigos?), M3 (reimportar com `RENAME`), M9 (exportação parcial).
- **UX/Frontend**: renderizar o corpo sem HTML bruto; escapar `ignoredFiles`, `skippedFiles`, `warnings`, `title` e `path` (nomes do zip podem ter bidi/zero-width); desabilitar o botão de importar durante o envio.
- **Tester**: casos A1 (corpus 20.000 wikilinks × 50.000 `#`, < 100 ms), A2 (`\0`/ESC/RLO em título e `moneylog.links`, API e importação), A3 (3.000 tags no frontmatter), zip truncado na fronteira e nome CP437.

## 6. Parecer

**🟡 Aprovado com ajustes.** A superfície de ataque do zip está correta e testada (slip, bomb, duplicatas, YAML malicioso, tudo ou nada, limites no container), o isolamento entre usuários e a integridade financeira estão garantidos por construção (FKs compostas, CHECKs, nenhuma escrita em tabela financeira), e o contrato 2.5.0 é compatível. Não aprovo sem ajustes porque há quatro 🟠 reais e baratos de corrigir: um custo quadrático que trava o pool (A1), controle/NUL vindos do YAML que geram 500 e derrubam a importação (A2), o limite de 100 tags burlável pelo frontmatter (A3) e o recálculo global de wikilinks a cada escrita (A4). Corrigidos A1 a A3 (com os testes indicados) e medido A4 nos limites declarados, o código pode ser mesclado; os 🟡/🟢 podem seguir como pendências com dono.
