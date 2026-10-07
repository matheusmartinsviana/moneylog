# Revisão de código: Etapa 6 (vault de notas Markdown), frontend, T114 a T119

Data: 2026-10-09 · Revisor: agente `revisor` · Escopo: `frontend/` (módulo `notes`, `src/util/markdown`, `highlight.ts`, `line-diff.ts`, `FilePicker`, telas `notes`/`note`, bloco "Notas vinculadas" nas 7 telas financeiras, guarda de controles nativos). Referências: plano da Etapa 6, ADR-009, ADR-007, contrato 2.5.0, revisão do backend (o que ficou a cargo do front), anexo FE-S-179 a FE-S-197.

Método: leitura integral dos arquivos tocados, execução dos portões (`lint:deps`, `ng lint`, guarda de controles nativos, `check-styles`, contraste, `typecheck`, suíte completa: **178 arquivos, 2.246 testes, todos verdes**) e **sondas executadas contra o renderizador real** (lexer + `parseMarkdownDocument` em Node via esbuild, e o `MarkdownViewComponent` em TestBed). As sondas ficaram só no scratchpad; nenhum arquivo `*.review.spec.ts` foi mantido no repositório e nenhum código de produção foi alterado.

## 1. Resumo

A decisão central está certa e bem executada: o Markdown vira **árvore de dados + templates Angular**, sem nenhum caminho de HTML. Não encontrei como executar script nem vazar dado por XSS, URL perigosa, imagem remota, link ou front matter. O ponto fraco **não é injeção, é negação de serviço no navegador**: o `marked` (lexer) tem custo **quadrático** em entradas pequenas e patológicas, o orçamento de 12.000 nós/400 mil caracteres **não limita o tempo do lexer**, o aninhamento **inline** não tem teto (estoura a pilha do Angular) e listas/tabelas escapam do orçamento de nós. Como o backend aceita notas de até 200 KB vindas de um zip de terceiros, **uma única nota (8 a 40 KB) congela a aba toda vez que é aberta**.

Há também uma opção destrutiva no painel de conflito (manter "o meu texto" quando o usuário não digitou nada) e um desvio de segurança no retry da importação em modo `RENAME`.

## 2. Itens conformes

- **Superfície de HTML:** `grep` em todo `src` (fora de specs): nenhum `innerHTML`, `outerHTML`, `bypassSecurityTrust*`, `DomSanitizer`, `insertAdjacent*`, `DOMParser`, `setProperty`, `srcdoc`, `window.open`. Único sink de URL é `[href]="node.href"` em `markdown-view.component.ts:248`, alimentado só por `safeLink` (e o Angular ainda sanitiza `href` por baixo). O único `createElement` novo é o do download (`file-download.service.ts`), pré-existente.
- **Tokens `html`/`tag` do marked** viram texto literal (`markdown.ts:250-253` e `:340-342`); `<script>`, `<iframe srcdoc>`, `<svg onload>`, `<img onerror>`, `<base>`, `<meta refresh>`, `<form>`, `<style>`, comentários e `<details>` saem como texto. Verificado por sonda.
- **`safeLink` (`safe-url.ts`)** é lista permitida (`http:`, `https:`, `mailto:`) sobre o `URL` do navegador. Sondei 21 URLs e 22 Markdowns: `javascript:` em maiúsculas/minúsculas, com `\t`, `\n`, `\u0001`, `&colon;`, `&#106;`, `&#x09;`, `%6A`, `ｊavascript` (largura total), `data:`, `blob:`, `file:`, `vbscript:`, `//host`, `user@host`, autolink `<javascript:...>`, link por referência com `[r]: JAVASCRIPT:...`, link com `<java script:x>` e imagem dentro de link: todos viram texto sem link ou link `http(s)` normalizado. Limite de 2.048 caracteres no href.
- **Imagens remotas** nunca carregam: o template mostra só o `alt` (`:262-264`); o endereço nem é exibido. Anti-rastreio ok.
- **Links externos:** `rel="noopener noreferrer"` sempre, `target="_blank"` nos `http(s)`, aviso a leitor de tela. `mailto:` sem `target`.
- **Front matter** é removido antes de renderizar (`stripFrontmatter`, regex linear, sem ReDoS).
- **Blocos de código** são `{{ block.text }}` em `<pre><code>`; `lang` fica no modelo e **não** vira classe nem atributo. **Não existe realce de sintaxe**: `highlight.ts` é só o destaque do termo de busca e devolve **segmentos de texto** (`{text, match}`), desenhados com `<mark>{{ }}</mark>`; nenhuma string HTML é gerada. O snippet/título da busca é seguro.
- **Mutação XSS** não se aplica: não há serialização nem reparse de HTML em lugar nenhum.
- **ReDoS nos regex próprios** (`safe-url`, `markdown-edit`, `highlight`, `line-diff`, `stripFrontmatter`, `decodeEntities`, `WIKILINK_SOURCE`): todos lineares. Medido em 200 KB: `highlightSegments` 0,2 s no pior caso (todo caractere casa), `toggleLinePrefix` 0,1 ms, `lineDiff` com 1.400 x 1.400 linhas 28 ms, `{1e6} \n` recusado (`null`) em 0 ms.
- **Dados do backend são escapados:** `title`, `path`, tags, snippet, contexto de backlink, `ignoredFiles`, `skippedFiles`, `renamedFiles`, `warnings.path`, rótulos de alvo e nomes de pasta são sempre `{{ }}` ou `interpolate` (substituição de passagem única: um nome de arquivo com `{to}` não injeta placeholder). A mensagem do aviso **não** é mostrada; só o texto traduzido pelo `code` (`import-report.component.ts:229-233`), o que evita eco de texto do zip.
- **Importação:** `FilePicker` valida extensão, vazio e 20 MB **antes** de entregar o valor; arquivo recusado nunca vira valor; `mode` por query; confirmação diz que **nada é sobrescrito** (o contrato só tem `SKIP`/`RENAME`); `413` vira `VAULT_IMPORT_TOO_LARGE`; 429 usa `Retry-After` com contagem regressiva; `INVALID`/`TOO_LARGE` não oferecem retry; relatório lista só 20 itens por seção com "mais N". Exportação só no clique, `Blob` por requisição autenticada, nome do `Content-Disposition` endurecido, URL de objeto liberada (`release`).
- **`Idempotency-Key`** em `POST /v1/notes` por `IdempotencyTracker` (chave nova por tentativa, **reutilizada** só se a falha foi ambígua e a entrada é idêntica; `exhaustMap` contra clique duplo). `PUT`/`move`/`links` usam `version`.
- **`VERSION_CONFLICT` não sobrescreve o digitado** em `save`; o texto local não é tocado; `exhaustMap` serializa escritas; `canDeactivate` com `ConfirmDialog` e `beforeunload` só com alterações (testado). Renomear fica bloqueado com texto sujo, com a razão.
- **UI própria:** guarda de controles nativos passa (AST do Angular/TS), `scripts/check-native-controls.test.mjs` cobre `input type=file` fora do `FilePicker`, `createElement('input')+.type='file'` etc. `<textarea>` é permitido pela própria guarda (ADR-007); o `app-text-area` tem `resize:none`, fonte de 16 px, `aria-*` do autocomplete e não usa `role="combobox"`.
- **Camadas:** `lint:deps` sem violações (621 módulos); nenhum `modules/*` importa `notes`; o bloco `app-linked-notes` aparece nas **7** telas (transação, meta, pessoa, dívida, cartão, fatura, resumo mensal), com `status` repassado (estornada/arquivada/cancelada). O seletor de vínculo fala com os outros módulos só pelas portas (`*Gateway`).
- **O front não calcula nada financeiro:** `formatMoney` só formata valor que a API devolveu; nenhuma aritmética sobre valor; criar nota vinculada só envia `links`.
- i18n pt/en/es com paridade verificada pela suíte (`translations.spec.ts`), tokens (`check-styles`), contraste 38 pares >= 4,5:1.
- **Decisão de não usar DOMPurify: sólida** (ver 5).

## 3. Achados

### 🔴 F1. Custo quadrático no lexer do `marked` congela a aba com nota de 8 a 40 KB (ReDoS por entrada pequena)

- `frontend/src/util/markdown/markdown.ts:360` (`marked.lexer(text)`); disparo em `note.page.ts:239-241` (`reset` → `previewText.set(body)` ao abrir) e `:200-202` (a cada edição, debounce 300 ms), via `markdown-view.component.ts:483`. Os tetos de `markdown.ts:74` e `:81` não cobrem o tempo do lexer: o orçamento só conta nós **depois** de lexar.
- Medido (Node 24, `marked` 18.1.0 fixado, `parseMarkdownDocument`):

| Entrada                                                                                                                | 10 KB | 20 KB | 40 KB    | 200 KB                       |
| ---------------------------------------------------------------------------------------------------------------------- | ----- | ----- | -------- | ---------------------------- |
| `*a *a *a ...`                                                                                                         | 1,3 s | 5,8 s | **22 s** | extrapola a minutos (>9 min) |
| `**a *b **a *b ...`                                                                                                    | 1,7 s | 7,0 s | **30 s** | idem                         |
| `~~a ~~a ...`                                                                                                          | 0,4 s | 1,8 s | 7,8 s    | idem                         |
| `_a_a_a...`                                                                                                            | 0,5 s | 1,0 s | 4,8 s    |                              |
| `<<<<...` (200 mil)                                                                                                    |       |       | 0,5 s    | **12,9 s**                   |
| `[a]([a]([a](...`                                                                                                      |       |       |          | 3,2 s                        |
| `<a <a <a ...`                                                                                                         |       |       |          | 4,0 s                        |
| `- [ ] a` repetido                                                                                                     |       |       |          | 8,7 s                        |
| `> > > ...` (200 mil)                                                                                                  |       |       |          | 1,6 s                        |
| (O teste de "200 KB" existente, `markdown.spec.ts` "Dado nota de 200 KB", usa texto benigno e por isso não pega isto.) |

- Impacto: a nota entra por importação de zip de terceiros (backend aceita até 200 KB por nota) ou é colada pelo usuário. Abrir a nota **trava a thread principal** (no desktop o preview lado a lado renderiza ao abrir; no celular, ao tocar em "Ler"). Persistente: toda abertura trava de novo, e o usuário não consegue chegar ao editor para corrigir nem à lixeira pela própria nota. Em PWA no iPhone o sistema mata a aba.
- Correção sugerida (qualquer uma, de preferência combinadas): (a) trocar o teto único de 400.000 por um teto de **entrada do lexer** bem menor (ex.: 40 a 60 KB; acima, mostrar como código com botão "Mostrar formatado" e aviso); (b) pré-varredura linear antes de lexar: se o número de delimitadores `*`, `_`, `~`, `<`, `[` em sequência passar de N (ex.: 2.000), cair no modo texto/código; (c) lexar em **Web Worker** com timeout e descartar o resultado; (d) não renderizar o preview ao abrir notas acima de X KB (renderizar sob demanda); (e) teste de regressão com esses seis padrões a 200 KB, limite de tempo 1 s.

### 🟠 F2. Aninhamento **inline** sem teto estoura a pilha do Angular (~1.000 níveis, 8 KB)

- `markdown.ts:187-200` e `:211-216`: `inlines()` recebe `depth` mas **nunca o verifica**; só `blockquote`/`list` consultam `MAX_DEPTH` (`:309`, `:314`). O template (`markdown-view.component.ts:203-291`) recursa por `ngTemplateOutlet` a cada `strong`/`em`/`del`.
- Medido: `~~a ` x N + `x` + ` a~~` x N produz profundidade N (2.000 níveis com 16 KB). Renderizando o `MarkdownViewComponent`: N=400 ok (1,4 s no jsdom), **N=1000 lança `RangeError: Maximum call stack size exceeded`** durante a detecção de mudanças.
- Impacto: erro não tratado na renderização da página da nota (a tela quebra; a nota não pode ser editada nessa sessão). Mesma origem de F1 (nota importada).
- Correção: limitar a profundidade em `inline()` (ex.: >= 8 a 16 vira `text` com o `raw`), passar `depth + 1` ao recursar, e teste com `~~a `/`**a *a ` aninhados. Opcional: envolver o desenho do preview num `ErrorBoundary`/fallback para texto puro.

### 🟠 F3. O orçamento de nós não limita itens de lista nem linhas/células de tabela

- `markdown.ts:319-329` (`t.items.map` percorre **todos** os itens, mesmo com o orçamento zerado, e cada item vira `<li>`), `:336-337` (`t.rows.map`/`row.map` idem; linhas e células vazias continuam sendo emitidas). O orçamento é debitado só por bloco/inline e **depois** de montar a lista.
- Medido (nós totais na árvore, orçamento 12.000): lista de 50.000 itens `- a` = **62.001**; tabela de 50.000 linhas de 1 coluna = **112.002**; lista numerada 40.000 = 52.001. Render real: lista de 2.000 itens levou **25 s** e tabela de 2.000 linhas **9,7 s** no jsdom (cada item cria vários views de `ngTemplateOutlet`/`@for`); num navegador é menos, mas 50 mil itens continua sendo um congelamento.
- Correção: debitar o orçamento por item, linha e célula **antes** de criá-los, `break` e `truncated = true` ao zerar; teste de orçamento com lista e tabela (o teste atual só usa inlines). Considerar renderizar item de lista sem o `ngTemplateOutlet` extra para reduzir o custo por item.

### 🟠 F4. "Salvar o meu texto por cima" também aparece quando o usuário não digitou nada (perda silenciosa de edição de outra aba)

- `note-editor.facade.ts:136-139` e `:294-304` (`fetchConflict(write, ...)` guarda `during` mas a UI ignora): conflito vindo de `move`, `links` (e qualquer escrita versionada) abre o mesmo painel; `note.page.ts:255-257` (`keepMine` → `saveOverConflict(draft())`) reenvia **o corpo** com a versão remota. Se o usuário só pediu "Vincular" ou "Renomear" e não editou, `draft()` é o texto antigo: o botão primário do painel sobrescreve no servidor a edição feita em outra aba/dispositivo, e o vínculo que o usuário queria nem é aplicado. `conflict-panel.component.ts:42-50` não diferencia.
- Correção: se `!dirty()` (rascunho == baseline), tratar como "recarregar e refazer a ação" (adotar o remoto e reexecutar `move`/`links` com a versão nova, ou ao menos esconder "Salvar o meu texto" e mostrar só "Usar a versão do servidor"); usar `during` para escolher o texto do painel; opcional: se `remote.body === mine` (retry após resposta perdida), resolver sozinho sem painel. Teste: conflito em `setLinks` com rascunho limpo não oferece sobrescrever.

### 🟡 F5. Retry da importação em modo `RENAME` pode duplicar o vault após falha ambígua

- `vault.facade.ts:98-100` (`retryImport`) e `vault-section.component.ts:354-358` (`canRetryImport` só exclui `INVALID`/`TOO_LARGE`). O comentário da facade e FE-S-195 afirmam idempotência **só para `SKIP`**, mas o botão "Tentar de novo" reenvia o mesmo zip com o mesmo `mode` em erro de rede/5xx/504, inclusive `RENAME` (zip de até 20 MB em rede móvel: resposta perdida depois do commit é plausível). Resultado: toda nota importada reaparece como `nome (2)`.
- Correção: no retry depois de falha ambígua em `RENAME`, avisar ("a importação pode ter sido concluída; confira em Notas antes de tentar de novo") ou forçar `SKIP` no retry; teste.

### 🟡 F6. Painel de diferença pode criar centenas de milhares de linhas de DOM

- `line-diff.ts:18` limita só `(a+1)*(b+1) <= 2.000.000`; com `remote` de 1 linha e `mine` de 200.000 linhas (200 KB de `\n`) o produto é 400 mil e passa; `conflict-panel.component.ts:70-76` desenha **uma `div` com 4 spans por linha**, sem teto nem virtualização. A área tem `max-height: 16rem`, então o custo é todo invisível.
- Correção: teto também no **número de linhas do resultado** (ex.: 5.000) e colapsar trechos `same` longos ("N linhas iguais"); cair em `diffTooBig` acima disso.

### 🟡 F7. Texto enganoso Unicode (RLO/controle/zero-width) sem isolamento

- Não há `bdi`, `dir`, `unicode-bidi` nem remoção de formato em lugar nenhum de `src`. O caminho é validado no backend e no front (`note-path.ts:5-8`), mas o **título** vem do front matter e o backend (revisão A2) ainda aceita ESC/RLO nele; `ignoredFiles`, `skippedFiles`, `renamedFiles` e `warnings.path` do relatório (`import-report.component.ts`) trazem nomes do zip **sem nenhuma validação** (e sem teto, M1 do backend), e o texto do link `[https://banco.com](https://evil.com)` não mostra o destino. É spoof visual, não execução.
- Correção: `<bdi>` (ou `unicode-bidi: isolate`) nos campos vindos de fora e função `displayText()` que troca controles/bidi/zero-width por `�`/visível nos nomes do relatório; considerar mostrar o host de links externos ao focar/passar o mouse.

### 🟡 F8. Exceção da guarda é por regra e por arquivo inteiro

- `scripts/check-native-controls.mjs:86-91`: a allowlist do `FilePicker` libera a regra `input-type` **para o arquivo todo**, não só para `type="file"`. Dentro de `file-picker.component.ts` qualquer `<input type="date">` passaria. Fora do arquivo a exceção **não** pode ser burlada (testado em `check-native-controls.test.mjs:235-250`).
- Correção: a allowlist aceitar apenas o valor literal `file` (`allowValue: 'file'`) e teste negativo `type="date"` dentro do picker.

### 🟡 F9. Fidelidade do Markdown (não é segurança)

- **Notas de rodapé** somem: `[^1]: texto` é consumido como `def` e descartado (`markdown.ts:278-280`), e a referência vira `^1` sem colchetes (sondado: `"text[^1]"` → `text` + `^1`). O conteúdo do rodapé não aparece em lugar nenhum.
- **Código inline** decodifica entidades (`markdown.ts:218`): `` `&lt;b&gt;` `` mostra `<b>`; em CommonMark deve mostrar `&lt;b&gt;`. Blocos de código não decodificam (inconsistente).
- **Front matter por heurística:** qualquer texto entre `---` no início é ocultado mesmo sem ser YAML (ex.: `---\nAviso importante\n---\ncorpo`).
- Título `#` vira `h2` e níveis 5 e 6 viram ambos `h6` (`:44-85` do template).

### 🟡 F10. Lista de notas e árvore de pastas

- `notes-list.facade.ts:40` e `:262-273`: a árvore faz até **20 requisições sequenciais** (`expand`) de 50 notas a cada abertura da tela e a cada restauração; acima de 1.000 notas a árvore fica silenciosamente incompleta (sem aviso na tela). Sugestão: endpoint de pastas no contrato ou aviso "mostrando as primeiras 1.000" e carga lazy.
- `linked-notes.facade.ts` (`loadMore` com erro): o estado `error` substitui a lista inteira já carregada; manter os itens e mostrar o erro só no botão.

### 🟢 Baixos

- `markdown-edit.ts:94-96`: `lineStart(text, 0)` com `text[0] === '\n'` devolve 1 (`lastIndexOf('\n', -1)` acha o índice 0); `toggleLinePrefix('\nabc', {0,0}, '- ')` retorna `from: 1, to: 0`. Funciona por acaso no `execCommand`, mas o fallback `setRangeText(text, 1, 0)` lança `IndexSizeError`. Usar `index === 0 ? 0 : ...`.
- `markdown-editor.component.ts:453-457`: `Enter`/`Tab` aceitam a sugestão durante composição de IME (`event.isComposing`); ignorar quando `isComposing`.
- `note.page.ts:336-341`: `confirmLeave` chamado duas vezes deixa a primeira promessa sem resolver; resolver a anterior com `false`.
- Texto sujo só é guardado em memória: sem rascunho local; um kill da aba (iOS) perde o digitado. Sugerir rascunho em `sessionStorage` com aviso ao reabrir (decisão de Produto).
- Nota em CRLF (zip do Windows): o `<textarea>` normaliza para LF; após a primeira edição o controle difere do `baseline` mesmo revertendo, e o primeiro salvar converte as quebras de linha. Normalizar o `baseline` ao comparar ou avisar.
- `link-target-search.service.ts:56`: `defaultFilters('2026-01-01')` com data fixa só para criar o filtro (e depois `from/to: null`); preferir uma fábrica sem data.
- `problem-message.ts:10`: `errors.codes[problem.code]` com `code` do servidor (`constructor`, `__proto__`) devolveria função; usar `Object.hasOwn`.
- Nota na lixeira usa `control.disable()` no `<textarea>` (`markdown-editor.component.ts:328`): disabled sai da ordem de tabulação e não seleciona/copia em alguns navegadores; preferir `readonly`.
- `vault-section.component.ts:393-397`: o rótulo de retry da **importação** usa a chave `export.retryIn`; mover para uma chave comum.
- O `FilePicker` aceita soltar arquivo, mas soltar fora da área abre o arquivo no navegador (comportamento padrão do navegador); adicionar `dragover/drop` no `document` com `preventDefault` enquanto a seção está aberta.

## 4. Riscos

- F1 a F3 são o mesmo risco por três portas: **o tempo de renderização de uma nota não é limitado**. Enquanto o `marked` rodar na thread principal sobre texto não confiável, qualquer nota de terceiros importada é um possível "botão de travar".
- O backend ainda aceita título com RLO/ESC (A2) e nomes enormes no relatório (M1); o front só estará protegido se aplicar F7.
- A importação é "tudo ou nada" no servidor, mas o retry cego do cliente (F5) cria dependência de um comportamento que o contrato só garante para `SKIP`.

## 5. Sobre a decisão "sem DOMPurify" (FE-S-179)

Sólida e mais forte que o plano: com árvore de dados + interpolação do Angular não existe string HTML a sanitizar, não há risco de mutação XSS, de configuração errada da lista permitida nem de regressão por atualização de biblioteca; a única superfície é a URL, coberta por lista permitida + `URL`. Os testes estruturais (`markdown.spec.ts`, 47 payloads) e de DOM real (`markdown-view.component.spec.ts`: tags, atributos `on*`, `style`, `srcdoc`, esquemas, `rel`) são bons e não tautológicos. **Pendência de documentação (Arquitetura):** o ADR-009 §5 (linha 51) ainda diz "`marked` com saída por `DOMPurify`"; atualizar a ADR (ou registrar o desvio FE-S-179 nela) e remover `DOMPurify` do plano. Lacunas de teste: nenhum teste de **tempo** com entradas patológicas (F1), de profundidade **inline** (F2), de orçamento com lista/tabela (F3), de conflito com rascunho limpo (F4) nem de `type="date"` dentro do `FilePicker` (F8).

## 6. Pendências por dono

- **Frontend (dev-frontend):** F1, F2, F3, F4 antes do merge; F5, F6, F7, F8, F9, F10 e 🟢 como ajustes.
- **Arquitetura:** atualizar ADR-009 §5 e o plano (S-159) para a decisão estrutural (sem DOMPurify); decidir se o lexer vai para Web Worker e qual o teto de entrada.
- **Backend:** A2/M1 da revisão do backend (título com controle/bidi, nomes com teto no relatório) reduzem F7; endpoint de pastas (F10) é opcional.
- **Produto/UX:** rascunho local contra perda (🟢); texto do aviso de retry da importação em `RENAME` (F5); como apresentar nota grande demais para formatar (F1).
- **Tester:** casos de F1 a F3 e F8 como regressão (tempo < 1 s a 200 KB; profundidade; orçamento).

## 7. Parecer

**🔴 Reprovado** para merge da Etapa 6 frontend **no estado atual**, apenas pela classe de defeito F1/F2/F3 (DoS de renderização por nota importada; reprodução objetiva, medida) e pelo F4 (opção destrutiva sem rascunho). Não há achado de execução de script, vazamento de dado ou perda de integridade financeira: a superfície de segurança do Markdown está correta e a base é de boa qualidade (2.246 testes verdes, lint, camadas e guarda de controles nativos sem violações). Corrigidos F1 a F4 com os testes de regressão indicados, passa para **🟡 Aprovado com ajustes** (F5 a F10 e 🟢 como pendências com dono).
