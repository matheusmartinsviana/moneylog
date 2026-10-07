# `src/util`

Funções e tipos genéricos, sem regra de negócio e sem Angular de apresentação.

- `money.ts`: tipo `Money` da API e `formatMoney` (formata pela moeda do dado, sem `Number()`).
- `money.ts` também tem `isNegative` (lê só o sinal da string, para destacar risco).
- `money-input.ts`: texto digitado ↔ string decimal da API, sem `number` (o ESLint proíbe `parseFloat`/`Number`/`Math` nele e no `MoneyInput`).
- `date.ts`: `todayIso()` (hoje em `America/Sao_Paulo`, S-1) `isIsoDate`, `formatCompetenceShort` (`out/2026`) e `formatInstant` (instante UTC no fuso do usuário); formata datas `YYYY-MM-DD` e competências `YYYY-MM` da API no idioma da UI.
- `api/schema.gen.ts`: tipos gerados de `contracts/openapi.yaml` (`npm run api:types`); só `src/modules/*/infra` importa.
- `api/problem.ts`: `toProblem(HttpErrorResponse)` → `{ status, code, fieldErrors }` e `ProblemError`; `api/idempotency-key.ts`: `newIdempotencyKey()` (UUID v4).
- `api-mocks.ts`: token `API_MOCKS` (flag de ambiente lida pelas facades de requisições).
- `safe-storage.ts`: `localStorage` que nunca quebra a tela (try/catch).
- `last-used-account.ts`: a última conta usada no `/quick-add` (preferência local, via `safe-storage`).
- `markdown/markdown.ts`: **Markdown seguro** (S-159, ADR-009). `parseMarkdownDocument` usa o `marked` só como **lexer** e devolve uma **árvore de dados** (`MdBlock`/`MdInline`); nenhuma string HTML é gerada (HTML bruto vira texto, links só `http(s)`/`mailto`, imagens nunca carregam, wikilinks `[[nome|alias#seção]]` viram nós para o backend resolver). Orçamento de 12.000 nós (item, linha e célula incluídos), profundidade inline 8 e teto de entrada de 200.000 caracteres. O lexer do `marked` é quadrático, então roda num **Web Worker com tempo limite de 1,5 s** (`markdown-render.ts` + `markdown.worker.ts`; estourou, a nota aparece como texto simples; FE-S-198). A tela (`MarkdownViewComponent`) desenha a árvore com templates do Angular: **não há `innerHTML`**, então o `DOMPurify` do plano não é necessário (ver desvio FE-S-179). `display-text.ts`: bidi/controle/zero-width aparecem como `‹U+XXXX›` (FE-S-203).
- `markdown/safe-url.ts`: lista permitida de esquemas de link (o parser de URL do navegador decide o esquema real: `java\tscript:` não passa).
- `markdown/markdown-edit.ts`: edições **puras** do editor (negrito, itálico, link, `[[ ]]`, lista, citação, `Tab`, contexto e conclusão do `[[`), `line-diff.ts` (diferença linha a linha do conflito), `highlight.ts` (termo buscado sem caixa nem acento) e `format-bytes.ts`.

`util` não importa `src/app` nem `src/modules` (verificado no `lint:deps`).
