---
tags: [moneylog, adr, backend, frontend, notas, seguranca]
status: aceito
data: 2026-10-05
task: T106 (Etapa 6)
relacionado: docs/planos/2026-10-05-etapa-6-vault-notas.md, docs/arquitetura/dominio-financeiro.md (§5, S-157 a S-166), ADR-001, ADR-008
---

# ADR-009: vault de notas Markdown no Postgres, wikilinks, sanitização e zip seguro

## Contexto

O MVP quer notas em Markdown vinculadas a transações, metas, pessoas, dívidas, cartões, faturas e resumos mensais, com `[[wikilinks]]`, backlinks, tags, busca, lixeira e **compatibilidade com o Obsidian** (PR 00, DS 01 "local-first"). O produto é um **PWA**: o navegador, principalmente o Safari, não acessa uma pasta do disco. O conteúdo da nota é **dado do usuário** e nunca instrução; o vault não pode tocar nenhuma lente financeira.

## Decisão

### 1. Armazenamento (S-157)

As notas moram no **Postgres** (`notes`, `note_tags`, `note_links`, migração `V6.00`; `unaccent` em `V6.01`). A compatibilidade com o Obsidian é por **exportação e importação de um zip** de arquivos `.md` com frontmatter YAML, não por sincronização com uma pasta. O "local-first" do DS 01 vira "seus dados, exportáveis a qualquer hora". O texto da nota é guardado **como foi escrito**, frontmatter incluído (exceto a chave reservada `moneylog`), até 200 KB. Título, tags e wikilinks são **derivados** do texto a cada gravação. Tabelas com FKs compostas `(id, user_id)` (S-76): o banco recusa nota, tag ou vínculo apontando para registro de outro usuário.

**Alternativas recusadas**

- _Arquivos no sistema de arquivos do servidor_: não escala em instância pequena de free tier, complica backup e isolamento por usuário, e abre superfície de path traversal na gravação.
- _File System Access API_ (conectar a pasta do Obsidian): não existe no Safari/iOS, que é o alvo principal do PWA; prometeria algo que a plataforma não entrega.

### 2. Resolução de wikilinks (S-158, S-48)

Como no Obsidian, `[[nome]]`, `[[pasta/nome]]`, `[[nome|alias]]`, `[[nome#seção]]` e o embed `![[arquivo]]` são resolvidos pelo **nome do arquivo** (caminho sem `.md`), **sem diferenciar maiúsculas nem acentos**. `[[pasta/nome]]` casa com o caminho inteiro ou com o final dele. A seção é guardada e ignorada na resolução. Links dentro de código (inline, ` ``` ` e `~~~`) e no frontmatter não são lidos nem reescritos. Alvo vazio (`[[#seção]]`) não é link de nota.

Exemplos de **empate** (vence o caminho mais curto; depois a ordem alfabética e o id, para o resultado ser determinístico):

| Notas ativas                                     | `[[MacBook]]` resolve para                      |
| ------------------------------------------------ | ----------------------------------------------- |
| `MacBook.md`, `x/MacBook.md`, `a/b/c/MacBook.md` | `MacBook.md`                                    |
| `x/MacBook.md`, `a/b/c/MacBook.md`               | `x/MacBook.md`                                  |
| `a/Nota.md`, `b/Nota.md` (mesmo tamanho)         | `a/Nota.md`                                     |
| `[[a/b/c/MacBook]]` ou `[[c/MacBook]]`           | `a/b/c/MacBook.md` (casa pelo final do caminho) |

Sem alvo, o link fica **pendente** (`target_note_id` nulo, o texto original guardado). A resolução gravada é refeita para o vault inteiro depois de criar, mover, mandar para a lixeira, restaurar e importar. Nota na lixeira não é alvo: os links para ela ficam pendentes e voltam a resolver ao restaurar.

**Renomear ou mover** (`POST /v1/notes/{id}/move`) reescreve, na **mesma transação**, o alvo dos wikilinks que apontavam para **aquela** nota (pela resolução gravada, nunca para a de mesmo nome em outra pasta), preservando alias, seção, embed e o resto do texto byte a byte. A forma é preservada (nome ou caminho, com ou sem `.md`); se o nome novo ficaria ambíguo, o link vira o caminho completo. As notas na lixeira também são reescritas, para a restaurada não voltar com link velho.

### 3. Frontmatter (S-166)

- Leitura **segura** com SnakeYAML: `SafeConstructor` (nenhum tipo arbitrário; `!!java...` falha), **sem âncoras nem aliases** (billion laughs, recursão), no máximo **64 KB** e 8 níveis, chave duplicada recusada.
- `title` vira o título (senão, o nome do arquivo); `tags` (lista ou texto) entram nas tags.
- Vínculos tipados em `moneylog.links` (D1 §5): `- { type: TRANSACTION, id: ... }`, `- { type: MONTHLY_SUMMARY, key: 2026-10 }` e `- { type: NOTE, path: reviews/x.md }` (nota por **caminho**, porque o id muda ao importar). A chave `moneylog` é **reservada**: pela API (`POST`/`PUT`) é `422 NOTE_FRONTMATTER_RESERVED`; na importação é lida e **removida do texto** (os vínculos viram `note_links`); na exportação é reinserida. Isso evita **dupla referência**: um vínculo vive só em `note_links`.
- As demais chaves do frontmatter ficam no **texto** e por isso são **preservadas** na exportação sem reserialização. A manipulação de `moneylog` é feita sobre o texto, então `exportar → importar` devolve o texto original byte a byte (propriedade testada com milhares de textos aleatórios; nenhum caso é normalizado: nem o frontmatter vazio ou o texto que começa com `---`).
- **Só é frontmatter um bloco `---...---` fechado cujo conteúdo é um mapa YAML válido e seguro (ou vazio)** (S-273, revisão de 2026-10-09). Régua horizontal com texto no meio (`---\nAta\n---`), lista, escalar, YAML quebrado, alias, `!!tag`, aninhamento ou bloco acima de 64 KB **não são frontmatter: o texto inteiro é corpo**, guardado e importado byte a byte (pela API e pela importação), sem aviso e sem perda. Nada é interpretado, então não há superfície nova. `title` com controle, formatação/bidi ou quebra de linha é `422 TEXT_INVALID_CHARACTERS`; `id`/`path`/`key`/`type` de `moneylog.links` com isso são descartados na importação (`LINK_IGNORED`).
- `moneylog` entre aspas ou com espaço antes de `:` também é lida e removida; a forma que o texto não consegue tirar descarta o bloco com `FRONTMATTER_INVALID`. Um frontmatter vazio ou em branco (ou um texto que começa com `---` sem ser frontmatter) recebe, na exportação, um **bloco novo na frente**: a importação o remove e o original volta intacto (round-trip byte a byte).
- Limitações documentadas (M5): wikilinks em **propriedades do frontmatter** (`related: "[[X]]"`) não são lidos nem reescritos ao renomear; `%% %%`, `<!-- -->` e `$...$` não são tratados como código, então links neles são lidos e reescritos.

### 4. Vínculos (S-160, S-164)

`note_links` guarda **uma referência por coluna tipada** (`target_note_id`, `target_transaction_id`, `target_account_id`, `target_card_id`, `target_invoice_id`, `target_person_id`, `target_debt_id`, `target_goal_id`), cada uma com **FK composta** `(id, user_id)`, mais `target_key` (`AAAA-MM`) e `target_text` (alvo pendente). Um `CHECK` exige **exatamente uma** referência nos vínculos explícitos e que a coluna combine com o tipo. Resultado: sem dupla referência e sem referência órfã; alvo de outro usuário é recusado pelo banco. Criar pela UI **valida** que o alvo existe e é do usuário (`422 NOTE_LINK_TARGET_NOT_FOUND`); na importação, alvo inexistente vira **pendente** sem falhar. Transação estornada, meta arquivada e dívida cancelada continuam sendo alvos válidos e o vínculo mostra o estado (`target.status`): nunca some. A fatura vazia removida quando o calendário do cartão muda (ADR-006) leva os vínculos junto (`ON DELETE CASCADE`, único caso de vínculo que some). Um vínculo explícito do tipo `NOTE` é o mesmo que um wikilink: os backlinks trazem **uma linha por nota de origem**.

### 5. Markdown nunca é HTML no backend; sanitização e limites

- O backend **nunca renderiza, remove nem altera HTML** do texto: `<script>`, `onerror=`, `javascript:` saem como entraram, como texto de um JSON (`application/json`, `X-Content-Type-Options: nosniff`: o navegador nunca o trata como HTML). Contextos de backlink e trechos de busca são **texto puro**. O que o backend faz é **validar** (limites e caracteres), não "sanitizar" por reescrita.
- **Front (S-159, T114/T116, revisão F1 a F3 da Etapa 6):** o `marked` roda **só como lexer**; a saída é uma **árvore de dados** (`MdBlock`/`MdInline`) desenhada por templates do Angular (interpolação = texto escapado). **Não há DOMPurify**, e é de propósito: não existe string HTML nenhuma a sanitizar (nada de `innerHTML`, `DOMParser`, `bypassSecurityTrust*`, `srcdoc`; a guarda de controles nativos os proíbe e a revisão confirmou por `grep` e por sondas). Isso elimina por construção a mutação XSS, o erro de lista permitida e a regressão por atualização de biblioteca; a única superfície é a URL, coberta por **lista permitida** (`http:`, `https:`, `mailto:`) sobre o `URL` do navegador, com `rel="noopener noreferrer"`, `target="_blank"` nos externos e o **host real** ao lado do link quando o texto não o mostra. HTML bruto vira texto literal; **imagens remotas nunca carregam** (anti-rastreio; aparece o texto alternativo); bidi/controle/zero-width aparecem como `‹U+XXXX›`. As versões (`marked` 18.1.0) são fixadas no `package.json`.
- **Front: tempo de renderização é limitado (revisão F1):** o lexer do `marked` tem custo **quadrático** em entradas pequenas (`*a *a ...` leva 1,3 s em 10 KB, 22 s em 40 KB e minutos em 200 KB; `**a *b `, `~~a `, `_a_a`, `<`, `[a](`, `- [ ] a` idem), então **nenhum teto de tamanho basta** (o de 200 KB é o limite de nota do backend e só protege a memória). Decisão: o lexing/parsing roda num **Web Worker com tempo limite de 1,5 s** (`src/util/markdown/markdown.worker.ts`, executor `MarkdownRenderer`): ao estourar, o worker é **encerrado** (`terminate()`) e a nota aparece como **texto simples** legível com o aviso "Esta nota é grande ou complexa demais para formatar; mostrando como texto"; a thread principal nunca é bloqueada. Um worker é reaproveitado por pré-visualização; um pedido novo substitui o anterior (resultado velho descartado por `requestId`, worker ocupado encerrado); a pré-visualização tem debounce de 300 ms ao digitar; um texto que já estourou não repete o tempo limite. O worker devolve a árvore (dados clonados por `postMessage`), nunca HTML. Defesas adicionais dentro do worker: profundidade **inline** máxima 8 (acima vira texto) e orçamento de 12.000 nós debitado **antes** de criar cada item de lista, linha e célula de tabela.
- **CSP e empacotamento do worker:** o Angular (esbuild) empacota `new Worker(new URL('./markdown.worker', import.meta.url), { type: 'module' })` como um arquivo `worker-*.js` **da mesma origem** (sem `blob:`/`data:`), com `webWorkerTsConfig` (`tsconfig.worker.json`, lib `webworker`). O `index.html` e o deploy atuais **não definem CSP**; quando o definirem, a política mínima que o app exige é `script-src 'self'; worker-src 'self'` (o worker é módulo de mesma origem; não precisa de `unsafe-inline`, `unsafe-eval` nem `blob:`). O service worker já cobre `worker-*.js` pelo grupo `/*.js` do `ngsw-config.json`. Sem `Worker` no ambiente (jsdom, navegador antigo), só textos de até 2.000 caracteres são formatados na thread principal; o resto aparece como texto simples.
- **Limites (S-162, S-271):** nota ≤ **200 KB** (bytes UTF-8, `NOTE_TOO_LARGE`); ≤ **5.000 notas** por usuário, lixeira inclusa (`NOTE_LIMIT_REACHED`); ≤ 100 vínculos explícitos e ≤ 500 wikilinks distintos por nota (**acima disso a nota é recusada**, `NOTE_LINK_LIMIT_REACHED`, para nenhum link ficar sem índice); ≤ 100 tags no conjunto final (frontmatter e corpo); título ≤ 255 pontos de código; caminho ≤ **255** caracteres e ≤ **10** níveis, `.md` obrigatório, único **sem diferenciar maiúsculas** entre as ativas (índice parcial sobre `path_key`, calculado pela aplicação, igual em qualquer locale do banco).
- **Caracteres:** o texto aceita quebra de linha, CR e tabulação, mas **nenhum outro caractere de controle** (o Postgres recusa `\u0000`) nem surrogate solto. O caminho recusa controle, formatação invisível e bidi (U+202E e semelhantes, que falsificam nome de arquivo), `\`, `..`, `/` inicial, letra de unidade, segmento oculto (`.`), nomes reservados do Windows (`CON`, `NUL`, `COM1`...) e `<>:"|?*#^[]`. Unicode é normalizado em NFC (o macOS gera NFD).

### 6. Exportar e importar o zip (S-157, S-162)

- **Exportar** (`GET /v1/vault/export`): um `.md` por nota **ativa** (a lixeira não vai), no caminho dela, com `moneylog.links` quando há vínculo explícito (para nota **da lixeira** o vínculo sai com `state: trashed`, S-275; **esvaziar a lixeira remove o vínculo**, decisão de produto adiada). O zip é montado em **lotes de 50** num arquivo temporário privado **antes** de o download começar (S-272, S-281): se passa dos limites da importação, `422 EXPORT_TOO_LARGE`; falha de montagem é erro normal, nunca um zip cortado com 200; o `Content-Length` revela download interrompido. Compartilha o limite de 6 pedidos por minuto. Anexos ficam fora do MVP.
- **Importar** (`POST /v1/vault/import`, multipart, `mode=SKIP|RENAME`): **tudo ou nada**, em uma transação, com **duas passadas** sobre o mesmo arquivo temporário: a 1ª valida o zip inteiro sem reter conteúdo (antes da trava do vault); a 2ª grava uma nota por vez.
  - **Nada é extraído.** O upload é copiado para um arquivo temporário em diretório privado (`rwx------`, arquivo `rw-------`, nomes aleatórios, apagado sempre em `finally`) e aberto com `ZipFile`, que valida o **diretório central**: zip truncado (inclusive cortado na fronteira de uma entrada), sem diretório central ou que não é zip → `422 VAULT_IMPORT_INVALID` (resolve a limitação antiga da leitura em fluxo). CRC e tamanho conferem com o diretório central.
  - **Zip slip:** `..`, `.`, caminho absoluto (`/x`, `C:/x`), `\` ou caractere de controle em **qualquer** entrada recusam o zip inteiro: `422 VAULT_IMPORT_INVALID`. Nome com `:` fora de `X:/` (`Q: dúvida.md`) só ignora aquele arquivo (S-276).
  - **Zip bomb e teto do vault (S-272):** arquivo > **20 MB**, > **5.500 entradas** (5.000 notas + acessórios) ou > **300 MB descomprimidos** → `422 VAULT_IMPORT_TOO_LARGE`. Os bytes são **contados ao ler** (também ao copiar o upload); nunca se confia nos tamanhos declarados. O teste usa um zip de ~300 KB que descomprime a 301 MB. A exportação recusa o que a importação não aceitaria, então o round-trip fecha no teto de 5.000 notas.
  - O que **não** derruba a importação e vai para o relatório: arquivo que não é `.md`, pastas ocultas, nome sem suporte, nota > 200 KB, arquivo que não é UTF-8, nota com mais de 500 wikilinks distintos (`NOTE_TOO_MANY_LINKS`), título com controle. Nomes sem a flag UTF-8 são lidos como UTF-8 e, se falhar, como CP437 (`NAME_ENCODING_GUESSED`). Nomes e mensagens do relatório são cortados em 200 caracteres. O BOM é removido.
  - Conflito de caminho: `SKIP` pula; `RENAME` cria `nome (2).md` e avisa `NOTE_RENAMED`. **Reimportar com `SKIP` não duplica; com `RENAME` duplica a cada envio** (documentado no contrato e na resposta, M3).
  - O container limita o upload a 21 MB (`spring.servlet.multipart`), logo acima dos 20 MB do caso de uso; acima disso também é `422 VAULT_IMPORT_TOO_LARGE`. Multipart malformado (sem boundary ou sem fechamento) é `400 VALIDATION_FAILED`.

### 7. Concorrência e ordem de travas

Toda escrita do vault começa por uma **trava de vault por usuário** (`pg_advisory_xact_lock`), porque a resolução de wikilinks olha o vault inteiro (criar a nota B enquanto se edita A que a cita não pode deixar o link de A pendente para sempre). As notas **não** participam da ordem de travas financeira da ADR-008 (movimentações → recorrência → cartão → dívidas → pessoas → metas → contas): o vault só lê os alvos, nunca trava nem grava nenhum, então não forma ciclo com elas. Falha de trava/deadlock vira `409 CONFLICT` (handler existente).

**Exceções declaradas ao "core sem biblioteca de terceiros" (S-280, M7):** (1) o SnakeYAML (versão da BOM do Spring Boot) só pode ser usado por `core.note.domain.Frontmatter`, com `SafeConstructor` e limites; uma regra do ArchUnit proíbe `org.yaml..` em qualquer outra classe do core. (2) `core.note` usa `IdempotentClaim` e `IdempotencyGateway` de `core.transaction` (a `Idempotency-Key` da criação); mover para `core.sk` arrastaria `TransactionExceptions`, então a única dependência permitida de `core.note` em `core.transaction` é essa, também por regra do ArchUnit.

**Recálculo parcial (S-278, revisão A4):** `note_links.target_name_key` guarda o nome dobrado do alvo (índice parcial `(user_id, target_name_key)` para wikilinks, migração V6.02). Criar, mover, mandar para a lixeira, restaurar e importar relêem só os links cujo nome coincide com o das notas afetadas (nome novo, antigo ou removido); a resolução só depende das notas de mesmo nome. Linhas anteriores à V6.02 têm chave nula, entram no próximo recálculo e ganham a chave.

**Desempate de nomes (S-274):** mais curto, depois o caminho dobrado, depois (entre `Café`/`Cafe`) o escrito exatamente igual e a ordem lexicográfica do caminho; nunca o UUID.

### 8. Buscar (S-163) e desempenho medido (S-278, S-279)

`unaccent` + `ILIKE` em título, caminho e corpo (sem full-text no MVP), curingas do termo escapados, termo ≤ 200 caracteres, relevância título > caminho > corpo e depois a data. Nenhum índice: varredura sequencial por usuário, até 5.000 notas. **Limite de tempo da busca: 10 s** (`setQueryTimeout`), acima disso `422 NOTE_SEARCH_TIMEOUT` ("use um termo mais específico ou filtre por pasta ou tag"); ainda assim o pior caso medido cabe no limite.

Medições (IT com Postgres 17 em contêiner, máquina de desenvolvimento; 2026-10-05, depois da migração V6.02 e do recálculo parcial):

| Cenário | Antes (QA 2026-10-09) | Depois |
|---|---|---|
| Criar / mandar para a lixeira / restaurar uma nota com 500 mil wikilinks gravados (1.000 notas x 500) | 640 a 760 ms por operação (lia todos os links) | **120 / 80 / 85 ms** (só os links do nome afetado, pelo índice) |
| Renomear com 500 notas linkando | 4,4 s (plano) | 0,7 s |
| Renomear com 2.000 notas linkando | 14 s | 7,6 s |
| Renomear com 4.900 notas linkando | 29 a 36 s | **33 s** (inalterado: o custo é reescrever e regravar 4.900 notas na mesma transação, sob a trava do usuário) |
| Busca em 5.300 notas (5.000 de ~4 KB e 300 de 200 KB) | 2,7 a 9 s | 2,7 a 5,7 s (pior: termo largo `a`) |
| Importar o zip de 5.000 notas / 2.000 notas com wikilinks | recusado (limite de 2.000 entradas) / 6 s | 25 s / 6,1 s |
| Exportar 5.000 notas (848 KB) | 1,7 s | 1,7 s (agora com o zip montado antes do 200) |

**Teto documentado de renomear:** seguro até ~2.000 notas linkando a mesma nota (~8 s); com 4.900 leva ~33 s numa transação só e pode passar do timeout de um proxy ou do cliente (a operação é atômica: ou conclui ou desfaz). Não há limite técnico imposto; se virar problema real, o caminho é reescrever em lote (um `UPDATE` por conjunto) ou em segundo plano. `pg_trgm` só se a busca de 5.000 notas grandes incomodar em produção.

**Deploy (RDS):** a migração `V6.01` cria a extensão `unaccent`, que é "trusted" a partir do PostgreSQL 13: o usuário do Flyway precisa ser o dono do banco (ou ter `CREATE` nele; o usuário mestre do RDS serve). Conferir `SHOW server_version` (>= 13) antes do primeiro deploy (roteiro em `docs/arquitetura/arquitetura.md`).

## Consequências

- Um PWA sem acesso a disco ganha portabilidade real (zip abre numa pasta do Obsidian) sem prometer sincronização contínua.
- Renomear custa uma gravação por nota que cita a renomeada (0,7 s com 500 notas, 7,6 s com 2.000, 33 s com 4.900; §8).
- O frontmatter é texto: chaves desconhecidas sobrevivem ao ciclo, e um frontmatter vazio pré-existente (`---\n---`) volta intacto (a exportação põe o bloco `moneylog` numa frente nova, S-273).
- Fora do MVP, anotado: criptografia de notas, histórico de versões, anexos e a inclusão das notas no backup JSON (campo aditivo futuro, S-257).
