# QA backend, Etapa 6 (T113): vault de notas Markdown

Agente: tester. Escopo: `backend/` (notas, lixeira, vínculos, backlinks, renomear/mover com reescrita de wikilinks, busca e tags, exportar/importar zip, migrações V6.00 e V6.01). Nenhum código de produção alterado; nada em `frontend/` nem em `contracts/`; sem commits. Fontes: plano da Etapa 6 (T106 a T113), ADR-009, D1 §8 (S-157 a S-166, S-24, S-48), PR 00 e PR 01 (integridade).

## 1. Resumo

- **Baseline** (`./mvnw clean verify`, JDK 21, antes dos meus testes): **BUILD SUCCESS, 1 h 08 min**. Unitários **1.304 / 0 falhas**; ITs **654 executados, 0 falhas, 1 ignorado** (BUG-QA-09 da Etapa 2, aberto desde antes).
- **Com os meus testes**: `clean verify` completo, **BUILD SUCCESS, 54 min**; unitários 1.304 verdes; ITs **717 executados** (63 novos), 0 falhas, **13 ignorados** (1 antigo + 12 com `@Disabled("BUG-QA-xx")`).
- Escrevi **11 classes de IT** (`backend/src/test/java/com/moneylog/qa/Note*QaIT`, `Vault*QaIT`, mais os ajudantes `NoteQa`). Cada classe foi executada isoladamente até ficar verde, os 12 testes que expõem bug estão com `@Disabled("BUG-QA-xx")` e **foram reexecutados com a condição de desativação desligada: os 12 falham**, o que confirma que cada reprodução é real.
- **A integridade financeira se sustenta**: usuários gêmeos com a mesma sequência de operações das Etapas 1 a 5 (um com 50 notas e 164 vínculos a todos os tipos de alvo, o outro sem nenhuma) têm fotografias idênticas em **13 etapas** (JSON de 15 endpoints e agregados do banco). Nenhuma operação de nota tocou razão, saldo, dashboard, resumo, projeção, meta ou dívida.
- **12 bugs** (nenhum 🔴 crítico): **5 🟠 médios**, **5 🟡 baixos** e **2 🟢 triviais**. Os mais relevantes: zip truncado importado pela metade **sem erro** (BUG-QA-02), vault de 2.001 a 5.000 notas exporta um zip que a importação recusa (BUG-QA-11), link 501+ de uma nota fica fora do índice e quebra no rename (BUG-QA-12), `title` com `\x00` no frontmatter dá 500 (BUG-QA-01) e nota que começa com régua `---` é recusada pela API e perde texto na importação (BUG-QA-03).
- **Desempenho**: renomear com 4.900 notas linkando leva 29 a 36 s (uma transação sob a trava do usuário); busca em 5.300 notas (300 de 200 KB) leva 2,7 a 9 s.
- **Parecer: 🟡 Aprovado com ressalvas** (ver §7).

## 2. Casos executados

Todos verdes salvo indicação. Resultados reais das execuções finais por classe.

### 2.1 Importação e exportação de zip, segurança (`VaultZipQaIT`, `VaultUploadQaIT`)

| Caso                                                                                                                                                                                                                                   | Resultado                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zip slip: `..`, `a/../../x`, `/abs`, `//abs`, `C:/`, `\`, `..\`, `./`, `a/./b`, `a/..`, `../x.txt`, `.obsidian/../../x`, `__MACOSX/../x`, NUL, `\n`, ESC (23 nomes, cada um misturado a notas boas)                                    | todos 422 `VAULT_IMPORT_INVALID`, **nada gravado**, nem as notas boas                                                                                           |
| Codificado/Unicode: `%2e%2e/`, `..%2f`, `..;/`, `..%5c`, fullwidth, U+2215, bidi U+202E, largura zero, `con`, `aux.txt`, `nul`, `com1`, `LPT9`, `dir/COM3.MD`, `x.md.`, `a*b`, `a?b`, `a<b`, `a\|b`                                    | aceitos como nome literal ou ignorados e listados; **nunca vira `..`**, nunca há segmento `..`/`.`; reservados do Windows e caracteres proibidos nunca importam |
| Symlink (atributo Unix `0xA1FF`)                                                                                                                                                                                                       | é só um `.md` com o texto do alvo; nada é seguido                                                                                                               |
| Nomes de 65.000 caracteres; 140 entradas de 60 KB                                                                                                                                                                                      | sem 5xx; ignoradas; a resposta tem o mesmo tamanho do zip (16,8 MB para 16,8 MB; amplificação 1:1, limitada pelo teto de 20 MB)                                 |
| Zip bomb: 150 MB de zeros (153 KB compactados); 600 notas de 199 KB (119 MB); 2.001 entradas                                                                                                                                           | 422 `VAULT_IMPORT_TOO_LARGE`, nada gravado; 2.000 entradas importam em 4 a 8 s                                                                                  |
| Zip aninhado (`.zip` dentro; `.md` cujo conteúdo é um zip)                                                                                                                                                                             | anexo ignorado e listado; o `.md`-zip é ignorado com aviso (bytes de controle)                                                                                  |
| Duplicadas, só caixa, NFC x NFD, `.MD`                                                                                                                                                                                                 | `SKIP` guarda a primeira e lista as outras; `RENAME` guarda **todas** (`a (2).md`...), sem perder conteúdo, sem path_key duplicado                              |
| `RENAME` em cadeia; caminho de 255 caracteres sem nome livre                                                                                                                                                                           | `a (3).md`; pula com aviso `NOTE_PATH_TAKEN`                                                                                                                    |
| Modos de conflito                                                                                                                                                                                                                      | não existe `OVERWRITE` (400); `skip`, `REPLACE`, `MERGE` são 400; sem `mode` = `SKIP`; nenhuma nota existente é sobrescrita                                     |
| Limite de 5.000 notas (lixeira conta)                                                                                                                                                                                                  | estouro é tudo ou nada (422 `NOTE_LIMIT_REACHED`) e o que existia fica intacto                                                                                  |
| Conteúdo Latin-1, UTF-16, BOM                                                                                                                                                                                                          | Latin-1/UTF-16 ignorados com aviso `NOTE_INVALID_ENCODING`; BOM removido                                                                                        |
| YAML malicioso (17 payloads: alias recursivo, billion laughs, `!!python`, `!!java.lang.ProcessBuilder`, `ScriptEngineManager`, merge key, aninhamento 10.000, > 64 KB, chave repetida, lista aberta, tab, `!!binary`, `.inf`, `!!set`) | a nota entra **sem** o frontmatter e com aviso; pior tempo **70 ms**; nada executa; pela API, 422 `NOTE_FRONTMATTER_INVALID`                                    |
| Multipart (MockMvc): sem `file`, parte com outro nome, vazio, campos extras, duas partes `file`, JSON, GET, lixo                                                                                                                       | 400, 400, 422, 200, sem 5xx, 400/415, 405, 200/422 coerentes                                                                                                    |
| Uploads com o **servidor real** (Tomcat): 19 MB, 20 MB exatos, 20 MB + 1 byte, 21 MB, 25 MB, 25 MB em pedaços (chunked)                                                                                                                | 200, 200, **422**, 422, 422 `VAULT_IMPORT_TOO_LARGE` em `problem+json`; app saudável depois; conexão cortada no meio não derruba                                |
| 15 campos extras, boundary errado, nome de arquivo com `..`, CRLF, enorme; `application/json`; `text/plain`                                                                                                                            | sem 5xx; `nosniff` em todas                                                                                                                                     |
| Zip corrompido (150 amostras, 1 a 3 bytes trocados)                                                                                                                                                                                    | 98 recusados (422), 52 aceitos (a troca caiu num nome ou texto); **nenhum 5xx**; recusado nunca grava                                                           |
| `.obsidian/`, `.trash/`, `__MACOSX/`, anexos, canvas, `.DS_Store`, `Thumbs.db`, pasta oculta, CRLF, CR sozinho, arquivo vazio                                                                                                          | só `.md` entra; o resto é listado; CRLF/CR preservados                                                                                                          |
| **Zip truncado** (120 cortes)                                                                                                                                                                                                          | **reprovado**: ver BUG-QA-02                                                                                                                                    |
| **Nome CP1252 sem flag UTF-8**, **`Q: x.md`**                                                                                                                                                                                          | **reprovados**: BUG-QA-04 e BUG-QA-05                                                                                                                           |
| **Multipart sem boundary** ou sem fechamento (servidor real)                                                                                                                                                                           | **reprovado**: BUG-QA-09                                                                                                                                        |

### 2.2 Round-trip (`VaultRoundTripQaIT`)

- **1.000 notas aleatórias** (semente 20261009; frontmatter com `tags`/`title`/`aliases`/`cssclasses`/aninhado/comentário/`...`, CRLF, código inline e em bloco, wikilinks de todas as formas, tabela com `\|`, HTML/JS, emoji, `![[foto.png]]`, vínculos explícitos a 9 tipos de alvo e entre notas): 986 criadas e 14 recusadas pelo domínio (as 14 são notas que começam com `---` sem ser frontmatter: BUG-QA-03). Exportar, **apagar tudo e importar**: **0 diferenças** (corpo byte a byte, título, tags, wikilinks, vínculos explícitos com as entidades); exportar de novo gera **os mesmos bytes** em todas as 986 entradas.
- 300 notas importadas para **outro usuário** (sem as entidades): corpo, título e tags idênticos, vínculos NOTE e de mês voltam, **todos** os vínculos de entidade viram pendentes (e entram em `pendingLinks`), nenhum aponta para dado do usuário B.
- 14 casos de borda do frontmatter com vínculo explícito (comentário, CRLF, `...`, sem quebra final, sem corpo, chave `moneylog2`, escalar multilinha, linhas finais em branco, BOM): voltam byte a byte. **3 casos reprovam**: BUG-QA-06. Link para nota da lixeira some do arquivo: BUG-QA-07.

### 2.3 Propriedade de wikilinks, rename, lixeira, backlinks (`NotePropertyQaIT`)

Oráculo **independente** do código de produção (outra implementação da resolução), 5 sementes × 140 operações (criar, editar, mover, lixeira, restaurar, esvaziar) com nomes com acento, caixa, espaço duplo, emoji, `ß`, `İ`, `ǅ`, `%`, `_`, `&`, parênteses, apóstrofo, CJK:

- **0 violações**: 176 renomeações, **169 notas reescritas**; depois de cada operação todo wikilink gravado resolve como o oráculo manda, nenhum aponta para a lixeira, os backlinks batem e **o corpo de toda nota sem link para a nota movida ficou intacto, byte a byte**; nas reescritas só o alvo mudou (alias, seção, `!`, `.md`, espaços internos, código inline e em bloco preservados) e o novo alvo resolve para a nota movida.
- Observação (não é falha): em 27 casos o rename **moveu o desempate** e um link que **não** foi reescrito passou a apontar para a nota movida (ela ficou com o caminho mais curto). É a regra S-158 (resolução dinâmica); registro porque o texto do usuário não mudou e o alvo sim.
- **Reprovado só no caso de empate por acento/caixa**: BUG-QA-08.

### 2.4 Integridade financeira (`NoteFinancialQaIT`)

Gêmeos A (com notas) e B (sem). Roteiro: compra parcelada 3x e 1x no cartão, despesa, empréstimo, dívida sem movimentação, meta com reserva, 2ª conta e 2º cartão; depois pagar fatura, estornar despesa, cancelar parcelas, cancelar dívida, estornar empréstimo, arquivar meta/pessoa/conta, desarquivar, estornar compra, mudar o calendário do cartão. Em A, entre cada passo: criar notas com 1 a 5 vínculos (transação, conta, cartão, fatura, pessoa, dívida, meta, mês), editar, mover, lixeira, restaurar, exportar.

- Fotografias mascaradas (ids e instantes) de `/v1/accounts`, `/cards`, `/people`, `/debts`, `/goals` (+ cada meta), `/dashboard/summary`, `/summaries/2026-10` e `2026-11`, `/projections`, `/entries`, `/recurrences/summary`, CSV, backup JSON, `/categories` e agregados do banco (razão por livro, linhas do razão, transações, metas, reservas, dívidas): **0 diferenças em 13 etapas**; a mesma resposta HTTP em cada operação financeira; razão fecha em zero, sem grupos desbalanceados.
- Alvo estornado/cancelado/arquivado: toda nota continua legível (200), o vínculo fica com o estado do alvo (`VOIDED` conferido) e `GET /v1/links` por entidade responde 200 em todos os passos. **Fatura vazia removida pela mudança do calendário: o vínculo some em cascata (`ON DELETE CASCADE`), a nota segue íntegra, a exportação segue 200.**

### 2.5 Concorrência (`NoteConcurrencyQaIT`)

Todos verdes, **sem 5xx e sem deadlock** (tudo termina dentro do limite de 90 s):

- Renomear A e B que se referenciam, 12 rodadas: só 200 ou 409 `VERSION_CONFLICT` (a versão de B muda pela reescrita); repetir com a versão nova termina; os dois links ficam reescritos e resolvidos.
- Criar `Nota`/`nota`/`NOTA`/`nOtA`/`.MD` ao mesmo tempo: exatamente um 201; mover duas notas para o mesmo caminho (caixa diferente): exatamente uma vence.
- Restaurar × esvaziar lixeira × editar × mover × lixeira × editar o leitor, 8 rodadas: só 200/204/404/409/422; sem link órfão.
- Importar (4 vezes, `RENAME`/`SKIP`) × editar × mover × lixeira: sem 5xx e sem caminho ativo duplicado.
- 8 criações simultâneas com a mesma `Idempotency-Key`: uma nota.
- **Nota (vinculada a meta, fatura, transação, cartão) × reserva de meta × pagamento de fatura × arquivar/desarquivar a meta × criar nota × mover, 15 rodadas**: só 200/201/409 `CONFLICT`/422, as reservas valem, razão fecha em zero.
- Vincular à fatura vazia × mudança do calendário que a remove, 15 rodadas: nunca 500, sem vínculo para fatura inexistente. Limitação do teste: em todas as rodadas a remoção venceu a corrida (o vínculo foi 422 `NOTE_LINK_TARGET_NOT_FOUND`); a janela do FK entre a leitura do alvo e o INSERT não foi exercitada de verdade.
- 4 usuários em paralelo com notas e reservas: termina.

### 2.6 Segurança e contrato (`NoteSecurityQaIT`, `NoteRateLimitQaIT`)

- **Isolamento**: o usuário B recebe 404 `NOTE_NOT_FOUND` **idêntico** ao de um UUID aleatório em GET, PUT, move, trash, restore, backlinks e links; a nota de A fica intacta (versão 0); lista, busca (`q`, `tag`, `folder`, `status=TRASHED`), tags, `GET /v1/links` (GOAL, NOTE, MONTHLY_SUMMARY) e `linkedType/linkedId` de B não trazem nada de A; B vincular a meta, nota, conta ou cartão de A dá 422 `NOTE_LINK_TARGET_NOT_FOUND`, igual a um alvo inexistente; exportação de B não traz nada de A; **importar em B um zip com `id` de meta e conta de A vira vínculo pendente, sem rótulo de A**.
- **Sem token** (7 variações × 13 rotas, mais usuário que não existe): 401 em todas, sem vazar; usuário fantasma nunca 5xx.
- **Entradas inválidas** (mais de 50 casos): campos desconhecidos (`userId`, `id`, `deletedAt`, extra em vínculo), tipos errados, JSON torto/duplo, NUL/ESC/`\n` em texto e caminho, caminho de 601 caracteres, tipo de vínculo inválido, versão fracionária ou nula, `pageSize` 0 e -1, `page` 0 e `abc`, `sort`/`status`/`linkedType` inválidos, `q` de 201 caracteres: todos 400 `VALIDATION_FAILED`; caminho inválido (`../`, `/`, `\`, `.txt`, `con`, bidi) é 422 `NOTE_PATH_INVALID`; tab e CRLF são aceitos.
- **Cabeçalhos**: `X-Content-Type-Options: nosniff` em todas as respostas (também problem+json e 4xx do multipart); `Content-Type` JSON/problem+json mesmo com `Accept: text/html`, `*/*` e `application/xml`; export `application/zip`, `attachment; filename="moneylog-vault-AAAA-MM-DD.zip"`, `no-store`; `Origin` hostil não gera CORS; **o corpo da nota (`<script>`, `onerror`, `javascript:`) sai como texto dentro do JSON, nunca como HTML e sem ser alterado**.
- **Rate limit** (com o limite real de produção via `@TestPropertySource`, porque o perfil `it` o sobe para 100.000): a 7ª exportação/importação na janela é 429 `TOO_MANY_ATTEMPTS` com `Retry-After`; export e import dividem a cota; outro usuário não é afetado; a importação limitada não grava nada; a janela anda.
- **Busca**: `%`, `_` e `\` são literais (`100%` só acha `100%`; `_` só acha `_`; `um_dois` não acha `umXdois`; `folder=a_b` não acha `aXb`); `unaccent`/caixa (`CAFE`, `café`, `acao`, `CORAÇÃO`); 17 payloads de injeção de SQL em `q`, `tag` e `folder` viram texto, sem 5xx, sem vazamento entre usuários, tabelas de pé.
- **Contrato**: toda resposta (sucesso e erro) de dezenas de chamadas das rotas de notas e vault bate com o OpenAPI; todos os `code` vistos (`NOTE_*`, `VAULT_IMPORT_INVALID`, `VALIDATION_FAILED`, `VERSION_CONFLICT`) estão na tabela do contrato. `NOTE_STATE_INCONSISTENT` existe no código mas não na tabela (vira 500 por desenho, "invariante interna"; não foi provocado).

### 2.7 Migrações (`NoteMigrationQaIT`)

V5.00 com dados (2 usuários; contas, transações, razão, metas, cartões, faturas, pessoas, dívidas) para V6.01: **2 migrações**, `validate` ok, reexecução = 0; razão, transações e faturas **intactos**; tabelas novas vazias; `unaccent('Ação e coração ÜNICODE')` = `Acao e coracao UNICODE`; índice único parcial: caminho (sem caixa) único entre ativas, **a lixeira libera o caminho**, outro usuário pode usar o mesmo, restaurar com caminho ocupado falha; CHECKs (caminho/título em branco, 200 KB em bytes, chave `AAAA-MM`, 1999-12 e 2101-01 recusadas, exatamente uma referência, wikilink não aponta para entidade, origem e tipo); **FKs compostas recusam o alvo de outro usuário em cada uma das 7 colunas** (transação, conta, cartão, fatura, pessoa, dívida, meta), no dono do vínculo e na tag; **CASCADE só na fatura vazia e na nota dona**: meta, pessoa e transação com vínculo **não** podem ser apagadas; apagar nota citada por outro wikilink é recusado no commit (a lixeira apaga os vínculos antes); índices válidos e usados. Base vazia a partir de V1 e `CREATE EXTENSION IF NOT EXISTS unaccent` idempotente. (A extensão é "trusted" no PG 13+; falta confirmar com o papel real do RDS, §5.)

### 2.8 Limites e desempenho (`NoteVolumeQaIT`)

| Medida                                                                                  | Resultado                                                                                                                |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 200 KB em bytes UTF-8 (ASCII, 2 e 4 bytes por caractere), criar e editar                | 204.800 bytes entra; 204.801 é 422 `NOTE_TOO_LARGE`; o banco também recusa (`ck_notes_body_size`)                        |
| 100 vínculos explícitos                                                                 | 100 passam; 101 e 200 (100 repetidos) são 400 `VALIDATION_FAILED` (o `@Size(max=100)` conta antes de remover duplicatas) |
| 150 tags                                                                                | 201, 100 guardadas (corte silencioso)                                                                                    |
| Tag de 100 caracteres, no corpo e no frontmatter; título de 300                         | 201, sem 5xx                                                                                                             |
| 5.000 notas incluindo lixeira                                                           | 4.995 + 10 = 422 `NOTE_LIMIT_REACHED`, nada gravado; + 5 cabem                                                           |
| **Renomear com N notas linkando** (tudo reescrito em 1 transação)                       | 500: **2,2 a 2,9 s**; 2.000: **14 s**; 4.900: **29 a 36 s**                                                              |
| **Busca** em 5.300 notas (5.000 de ~4 KB + 300 de ~197 KB)                              | 2,7 a 9 s por consulta (`a`: 8,9 s; `fim-g`: 5,4 s; sem resultado: 2,7 s); lista sem busca 71 a 124 ms; tags 40 ms       |
| Criar/lixeira/restaurar com **500 mil linhas** de wikilink gravadas (1.000 notas × 500) | 0,64 / 0,76 / 0,76 s                                                                                                     |
| **Exportar 5.000 notas**                                                                | 0,7 a 3,9 s, 848 KB, 5.000 entradas                                                                                      |
| Importar 2.000 notas com wikilinks e tags                                               | 5,6 s                                                                                                                    |
| Importar o zip das 5.000 notas                                                          | **422** (BUG-QA-11)                                                                                                      |

## 3. Bugs

Severidade: 🔴 crítico, 🟠 médio, 🟡 baixo, 🟢 trivial. Todos têm teste com `@Disabled("BUG-QA-xx")`; todos foram **reexecutados habilitados e falham**.

### BUG-QA-01 · 🟠 `title` do frontmatter com `\x00` derruba `POST /v1/notes` com 500

- **Passos:** `POST /v1/notes` `{"path":"a.md","body":"---\ntitle: \"a\\x00b\"\n---\ncorpo"}` (o escape YAML `\x00` vira NUL no título). Também com `title: "\x00"`.
- **Esperado:** 422 (ou título saneado).
- **Obtido:** `500 INTERNAL_ERROR` (o Postgres recusa NUL no `VARCHAR`). Os controles do **corpo** e do **caminho** são recusados, o `title` derivado do YAML não passa por `PlainText.requireClean`. Tags, aliases e chaves livres com NUL não derrubam (201).
- **Evidência:** `VaultZipQaIT.nulNoFrontmatter` (`QA-E6-ZIP NUL title: "a\x00b" -> 500 INTERNAL_ERROR`). Na importação o mesmo conteúdo responde 200 (a nota vai para ignoradas por outro caminho).
- **Camada:** back (`NoteContent.titleFor` / `Frontmatter.Parsed.title`). Valida também ESC, `\n` e U+0085 no título (hoje aceitos).

### BUG-QA-02 · 🟠 Zip truncado é importado pela metade, sem erro

- **Passos:** exportar 40 notas, cortar o zip em ~3.000 bytes (ou em qualquer ponto que caia num limite de entrada ou no cabeçalho local) e importar.
- **Esperado:** 422 `VAULT_IMPORT_INVALID` ("zip truncado"), nada gravado.
- **Obtido:** `200` com `created=31` de 40; o `ZipInputStream` trata EOF num cabeçalho local como fim do arquivo. Em **120 cortes** (100 aleatórios, semente fixa, e 20 nos últimos bytes): 46 recusados, 44 completos (corte só no diretório central), **30 parciais silenciosos**. O leitor só detecta "0 entradas com cabeçalho truncado".
- **Evidência:** `QA-E6-ZIP truncado: total=120 recusados=46 completos=44 PARCIAIS SILENCIOSOS=30 ex.: [3058 bytes -> created=31, 3637 bytes -> created=37, 974 bytes -> created=10]`.
- **Camada:** back (`VaultZipReader`): exigir o EOCD/diretório central e conferir o número de entradas com o que foi lido.

### BUG-QA-03 · 🟠 Nota que começa com régua horizontal `---`: API recusa e importação apaga texto

- **Passos:** corpo `"---\nAta da reunião\n---\nConteúdo depois da régua"` (o Obsidian abre e guarda esse arquivo).
- **Esperado:** aceitar como texto (frontmatter só quando o YAML é um mapa) ou, no mínimo, não perder conteúdo.
- **Obtido:** `POST /v1/notes` = 422 `NOTE_FRONTMATTER_INVALID` ("o frontmatter precisa ser um mapa"). **Importação:** `200`, mas o corpo salvo é só `"Conteúdo depois da régua"`: **o texto entre as réguas é descartado** (aviso `FRONTMATTER_INVALID` no relatório). No round-trip aleatório, **14 de 1.000** notas geradas caem nisso.
- **Evidência:** `VaultZipQaIT.reguaHorizontalNaoEFrontmatter`.
- **Camada:** back (`Frontmatter.parse`/`dropBlock`, `ImportVaultUseCaseImpl.prepareFrontmatter`).

### BUG-QA-11 · 🟠 Vault de 2.001 a 5.000 notas exporta um zip que a importação recusa

- **Passos:** vault com 5.000 notas (limite permitido); `GET /v1/vault/export` (5.000 entradas, 848 KB); `POST /v1/vault/import` com esse zip.
- **Esperado:** o export de um vault válido pode ser importado (exportar/importar é o backup do vault, S-157).
- **Obtido:** `422 VAULT_IMPORT_TOO_LARGE "mais de 2000 entradas"` (S-162 limita a importação a 2.000 entradas, mas o limite de notas é 5.000).
- **Evidência:** `QA-E6-PERF importar o zip de 5.000 notas: 384 ms -> 422 VAULT_IMPORT_TOO_LARGE`; `NoteVolumeQaIT.reimportar5000`.
- **Camada:** back/contrato (decidir: subir o limite de entradas para pelo menos 5.000 + anexos ou paginar o export).

### BUG-QA-12 · 🟠 A partir do 501º wikilink distinto de uma nota, o link não é indexado e quebra no rename

- **Passos:** nota com `[[p0]] ... [[p499]] [[Alvo Tardio]]` (501 alvos distintos); criar `Alvo Tardio.md`; renomear para `Alvo Renomeado.md`.
- **Esperado:** backlink na nota-alvo e texto reescrito para `[[Alvo Renomeado]]` (plano T110 CA1, T109 CA4).
- **Obtido:** o 501º link não vira linha (`MAX_WIKILINKS`), então o alvo **não mostra o backlink**, e o rename **não reescreve** o texto da fonte (`...[[pendente499]] [[Alvo Tardio]]`): link quebrado sem aviso.
- **Evidência:** `QA-E6-LIM link 501 ...: backlinks do alvo = []`, `NoteVolumeQaIT.quinhentosWikilinks`.
- **Camada:** back (`Note.applyBody`): ou recusar o excesso com 422, ou não descartar em silêncio; o rename deveria olhar o texto também.

### BUG-QA-08 · 🟡 Nome escrito exatamente igual não vence o nome só equivalente (acento/caixa)

- **Passos:** `Café.md` e `Cafe.md` no mesmo lugar e uma nota com `[[Cafe]]` (repetir 12 vezes); ou renomear uma nota para `e.md` havendo `é.md`.
- **Esperado:** `[[Cafe]]` resolve para `Cafe.md` (correspondência exata antes da equivalente, como o Obsidian); renomear não deixa o link apontando para outra nota.
- **Obtido:** o desempate cai em comprimento do caminho, depois caminho dobrado e **UUID aleatório**: **9 de 12** resolveram para `Café.md`. No rename, o link é reescrito para o nome novo e passa a resolver para a nota equivalente (a "fallback" de caminho completo é igual ao nome na raiz): em um teste de propriedade sem proteção apareceram 17 violações desse tipo.
- **Evidência:** `QA-E6-PROP exato x equivalente: 9 de 12 resolveram para a nota errada`; `NotePropertyQaIT.correspondenciaExataVence`. O teste de propriedade evita esse empate de propósito (0 violações fora dele).
- **Camada:** back (`WikilinkResolver`): comparar o texto exato (NFC, sem dobra) antes do dobrado.

### BUG-QA-09 · 🟡 Multipart malformado responde 500

- **Passos (servidor real):** `POST /v1/vault/import` com `Content-Type: multipart/form-data` **sem** `boundary`; ou corpo que abre a parte `file` e termina sem o boundary de fecho.
- **Esperado:** 400 `VALIDATION_FAILED`.
- **Obtido:** `500 INTERNAL_ERROR`. (Boundary errado, corpo vazio, sem arquivo e nome de arquivo hostil são 400/200 corretos.)
- **Evidência:** `VaultUploadQaIT.multipartSemBoundary`.
- **Camada:** back (`GlobalExceptionHandler`: `MultipartException`/`IllegalStateException` do Tomcat).

### BUG-QA-04 · 🟡 Zip com nomes em CP1252 (sem flag UTF-8) derruba a importação inteira

- **Passos:** entrada `Revisão.md` com o nome em `windows-1252` e o bit EFS desligado (Explorer do Windows antigo, zips legados em português), junto de outras notas boas.
- **Esperado:** importar o que dá (ou decodificar CP437/CP1252) e avisar.
- **Obtido:** `422 VAULT_IMPORT_INVALID "não foi possível ler o zip"`, nada importado.
- **Evidência:** `VaultZipQaIT.nomeCp1252`. **Camada:** back (`VaultZipReader`, `ZipInputStream(UTF_8)` lança `IllegalArgumentException`).

### BUG-QA-05 · 🟡 Nome "Q: dúvida.md" recusa o zip inteiro

- **Passos:** zip com `Q: dúvida.md` (letra + dois-pontos, válido no macOS/Linux) e notas boas.
- **Esperado:** ignorar só essa entrada e avisar (como os demais nomes sem suporte).
- **Obtido:** `422 VAULT_IMPORT_INVALID "caminho absoluto no zip"` (a regra de letra de unidade vale para qualquer letra).
- **Evidência:** `VaultZipQaIT.letraEDoisPontos`. **Camada:** back (`VaultZipReader.requireSafeName`): só rejeitar quando virar `X:/` ou `X:\`.

### BUG-QA-06 · 🟡 Frontmatter vazio ou em branco com vínculo explícito: o round-trip remove o bloco

- **Passos:** criar `---\n---\ncorpo` (ou `---\n\n---\ncorpo`, ou `---\n---\n`) com um vínculo de mês; exportar; apagar; importar.
- **Esperado:** corpo idêntico (byte a byte, critério do plano). **Obtido:** `corpo` (o `stripMoneylog` remove o bloco inteiro quando só sobram linhas em branco).
- **Evidência:** `QA-E6-RT3 FALHA vazio: diverge em 0: [---\n---\ncorpo] x [corpo]`; `VaultRoundTripQaIT.bordasDoFrontmatterVazio`. **Camada:** back (`Frontmatter.stripMoneylog`).

### BUG-QA-07 · 🟡 Vínculo explícito para nota na lixeira some do arquivo exportado

- **Passos:** A com vínculo NOTE para B; B para a lixeira; exportar. **Esperado:** `A.md` mantém a referência (ou o export avisa). **Obtido:** a referência a `lixo.md` não está no frontmatter exportado e, depois de esvaziar a lixeira, o vínculo também some do banco, sem aviso.
- **Evidência:** `VaultRoundTripQaIT.lixeiraNaoVai`. **Camada:** back (`VaultZipWriter.refsOf`, `deleteTrashed`); pode ser decisão de produto, pela regra "nada é apagado em silêncio" (S-161) vale registrar.

### BUG-QA-10 · 🟢 Título cortado no meio de um emoji devolve substituto solto

- **Passos:** `title:` de 254 `a` + `😀` + `bb`. **Esperado:** corte por ponto de código. **Obtido:** `title.substring(0, 255)` deixa um par substituto pela metade (UTF-16 inválido na resposta, `?` no banco).
- **Evidência:** `NoteVolumeQaIT.tituloCortadoNoEmoji`. Os trechos de busca e de backlink (160 caracteres) **não** têm o problema (0 de 40 casos). **Camada:** back (`NoteContent.cap`).

### Observações de desempenho e desenho (sem teste desativado)

- **PERF-01 · 🟠 Renomear com muitas notas linkando é lento:** 2.000 notas = 14 s; 4.900 notas = 29 a 36 s, tudo em **uma transação sob `pg_advisory_xact_lock`** do usuário (bloqueia todas as outras operações de nota dele nesse tempo; um proxy ou o cliente tende a estourar o timeout antes). O plano pedia "limite documentado (medido)": o dev mediu 500. Sugestão: documentar o teto (hoje seguro até ~500 notas, 2 a 3 s) ou reescrever em lote com um `UPDATE` por conjunto.
- **PERF-02 · 🟡 Busca em volume:** `unaccent(ILIKE)` sem índice varre o corpo todo: 5.300 notas (300 de 200 KB) = 2,7 a 9 s. Aceitável para centenas de notas (S-163), lento no teto de 5.000 notas grandes. O plano só exigia medir 2.000.
- **OBS-03:** `refreshWikilinks` lê todos os wikilinks do usuário a cada criação/lixeira/restauração/mover/importação; com 500 mil linhas gravadas custou 0,64 a 0,76 s e o heap suportou (em 2,5 milhões de linhas, 5.000 notas × 500 links, a extrapolação é ~4 s e centenas de MB por requisição; não medido).
- **OBS-04:** `NoteLink.identity()` ignora alias e embed: `[[AÇÃO]]`, `[[Ação.md]]` e `![[ação]]` viram **um** vínculo (o primeiro). Correto para resolução e backlinks; o contexto/alias guardado é só o do primeiro.
- **OBS-05:** o relatório de importação devolve cada nome ignorado inteiro: um zip de 16,8 MB com nomes de 60 KB gera uma resposta de 16,8 MB (1:1, limitada pelos 20 MB). O limite de taxa (6/min) é aplicado depois de o multipart ser lido.
- **OBS-06:** `mode=""` é tratado como `SKIP` (200) em vez de 400.
- **OBS-07:** `linkedKey`/`targetKey` de listagem (`2026-13`, `2026-1`) são aceitos e devolvem lista vazia (200), enquanto a criação os recusa.

## 4. Testes adicionados

Em `backend/src/test/java/com/moneylog/qa/`:

| Arquivo                    | Conteúdo                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NoteQa.java`              | ajudantes: chamadas conferidas contra o contrato, upload multipart e **construtor de zip cru** (`RawZip`: nomes arbitrários e repetidos, STORED/DEFLATED, symlink, sem diretório central, bomba de zeros em fluxo) |
| `VaultZipQaIT.java`        | 24 testes: zip slip, bomb, duplicadas, reservados, encoding, YAML, multipart, truncado, corrompido, pastas especiais                                                                                               |
| `VaultUploadQaIT.java`     | 4 testes com **servidor real**: 19/20/20 MB+1/21/25 MB, multipart estranho, chunked, corpo cortado                                                                                                                 |
| `VaultRoundTripQaIT.java`  | 5 testes: 1.000 notas aleatórias (mesmo usuário e outro usuário), 14 bordas de frontmatter, lixeira                                                                                                                |
| `NotePropertyQaIT.java`    | oráculo independente, 5 sementes × 140 operações; empate exato x equivalente                                                                                                                                       |
| `NoteFinancialQaIT.java`   | gêmeos com e sem notas, 13 etapas                                                                                                                                                                                  |
| `NoteConcurrencyQaIT.java` | 8 testes de concorrência, inclusive contra reserva de meta, pagamento de fatura e remoção de fatura vazia                                                                                                          |
| `NoteSecurityQaIT.java`    | 6 testes: isolamento, sem token, mais de 50 entradas inválidas, cabeçalhos, busca/SQL, contrato                                                                                                                    |
| `NoteRateLimitQaIT.java`   | limite de 6/min com o valor real                                                                                                                                                                                   |
| `NoteMigrationQaIT.java`   | V5.00 com dados para V6.01 e base vazia                                                                                                                                                                            |
| `NoteVolumeQaIT.java`      | limites, desempenho e trechos                                                                                                                                                                                      |

**12 testes `@Disabled("BUG-QA-xx")`**: `nulNoFrontmatter` (01), `zipTruncado` (02), `reguaHorizontalNaoEFrontmatter` (03), `nomeCp1252` (04), `letraEDoisPontos` (05), `bordasDoFrontmatterVazio` (06), `lixeiraNaoVai` (07), `correspondenciaExataVence` (08), `multipartSemBoundary` (09), `tituloCortadoNoEmoji` (10), `reimportar5000` (11), `quinhentosWikilinks` (12). Para reproduzir um deles: `./mvnw verify -Dtest=NONE -Dsurefire.failIfNoSpecifiedTests=false -Dit.test=<Classe> -DargLine="-Djunit.jupiter.conditions.deactivate=org.junit.*DisabledCondition"`.

Nota de ambiente: `spring.datasource.hikari.auto-commit=false`; nos ITs `jdbc.update` sem `TransactionTemplate` **não confirma**. Os meus testes usam `committed(...)` onde escrevem direto no banco.

## 5. Riscos e pendências

1. **Corrida vincular × remover fatura vazia** não foi exercitada de verdade (a remoção vence sempre no MockMvc). Pede teste com atraso injetado na janela entre `describe` e o INSERT; hoje a FK composta garante integridade, mas um `DataIntegrityViolation` ali viraria 500 (não observado).
2. **`CREATE EXTENSION unaccent` no RDS:** é "trusted" no PG 13+, então o dono do banco pode criar; confirmar com o papel real da migração no ambiente alvo (não há RDS aqui).
3. **Memória/heap no teto** (5.000 notas × 500 wikilinks, `refreshWikilinks`) e **backup JSON (`/v1/exports/backup`) não incluem notas** (conferido em `BackupResponse`: só o campo `notes` de transações e pessoas, nenhuma nota do vault); o usuário que espera "backup completo" precisa do export do vault à parte. Decisão de produto.
4. **XSS:** a suíte de payloads de renderização é do front (T114 CA2 / T120). Aqui só se prova que o backend devolve o texto como dado, sem alterá-lo e sem `text/html`.
5. Fora do escopo desta tarefa: E2E com navegador e acessibilidade (T120).
6. Validar com o usuário: a regra de empate por UUID (BUG-QA-08), o corte silencioso em 500 wikilinks e 100 tags (BUG-QA-12), a perda do vínculo para nota da lixeira (BUG-QA-07) e o teto de renomear (PERF-01).

## 6. Execução completa

`./mvnw clean verify` completo com os meus testes (JDK 21): **BUILD SUCCESS, 54 min 04 s**. Unitários **1.304 / 0 falhas**; ITs **717 executados** (654 + 63 meus), **0 falhas, 13 ignorados** (1 antigo da Etapa 2 + os 12 `@Disabled("BUG-QA-xx")` desta etapa). Os 12 ignorados foram reexecutados com a desativação desligada em execução separada (45 testes das classes afetadas): **os 12 falham**, as demais passam.

## 7. Parecer

**🟡 Aprovado com ressalvas.** O que a Etapa 6 prometia no domínio funciona: o vault não toca nenhuma lente financeira (gêmeos idênticos em 13 etapas), renomear reescreve exatamente os links certos e mais nada (176 renomeações, 0 violações, byte a byte), o round-trip de 1.000 notas aleatórias é idêntico, o isolamento entre usuários vale em todas as rotas, a trava por usuário não gera deadlock nem 5xx, as migrações são seguras e a defesa contra zip slip, zip bomb e YAML hostil é sólida (nenhuma das ~50 formas hostis gravou algo ou executou).

Não é "Aprovado" porque há **5 bugs médios** que o dev precisa decidir antes de o front depender do vault em produção, em ordem de prioridade: **BUG-QA-02** (zip truncado importado pela metade sem erro: perda silenciosa), **BUG-QA-11** (backup de vault com mais de 2.000 notas não restaura), **BUG-QA-12** (link 501+ quebra no rename), **BUG-QA-03** (régua `---` recusada e texto apagado na importação) e **BUG-QA-01** (500 com `title` contendo `\x00`). Nenhum afeta dinheiro nem segurança entre usuários. Os bugs baixos e as observações de desempenho (renomear 4.900 notas em ~30 s sob a trava do usuário) podem ir para o backlog.
