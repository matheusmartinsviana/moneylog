---
tags: [moneylog, adr, frontend, ui, acessibilidade]
status: aceito
data: 2026-10-05
relacionado: ADR-001, DS 00 e DS 01 (vault)
---

# ADR-007: UI própria sem controles nativos e overlay próprio (sem `@angular/cdk`)

## Contexto

O moneylog é um PWA mobile-first com direção de design própria (DS 00: paleta neutra, cantos de 12 a 18 px, voz calma, "nada de visual bancário"). Os controles nativos do navegador (`<select>`, `<input type=date|month|checkbox|radio|...>`, `<details>`, `<dialog>`, `title`, `alert/confirm/prompt`) não obedecem a esse desenho: cada navegador e sistema os pinta de um jeito (o seletor de data do iOS é um carrossel de rolagem, o do Chrome um popup, o do Firefox outro), não aceitam os tokens de tema claro/escuro, não deixam controlar foco, tamanho de alvo (44 px), anúncio para leitor de tela nem a máscara por idioma (dd/mm/aaaa, mm/dd/yyyy). Para um produto financeiro em que digitar a data e o valor certo é o centro da experiência, a inconsistência é defeito de produto, não detalhe.

A exigência do usuário é uma **garantia**: nenhum controle nativo pode aparecer em nenhuma tela, hoje ou depois.

## Decisão

### 1. Nenhum controle nativo; componentes de base próprios

Todos os controles de formulário e de sobreposição são componentes de `src/app/common/components` (catálogo em `src/app/common/components/README.md`): `Select`, `DatePicker`, `MonthPicker`, `Checkbox`, `Switch`, `RadioGroup`, `NumberStepper`, `Disclosure`, `Tabs`, `ProgressBar`, `Tooltip`, `Menu`, `Dialog`, `Sheet`, `ConfirmDialog`, `OverlayPanel`, além de `TextField`, `MoneyInput` e `SegmentedControl`. Seguem os padrões do WAI-ARIA APG (select-only combobox, date picker dialog, checkbox, switch, disclosure, tooltip, dialog modal). Datas viajam como `YYYY-MM-DD` e competências como `YYYY-MM` (sem objeto `Date` local, sem fuso do aparelho). Fica permitido só `<input>` de texto (`text`, `email`, `password`), `<textarea>` e `<button>`.

### 2. Overlay próprio, sem `@angular/cdk`

Um único `OverlayPanel` serve a lista do Select, o calendário e a grade de meses. Em tela larga é um **popover** ancorado ao gatilho (portal no fim do `body`, flip para cima quando falta espaço, shift para caber, altura limitada à área visível); em tela compacta é uma **folha inferior modal** (foco preso, fundo `inert`, rolagem travada, botão "Fechar"). `Esc`, toque fora e `Tab` (no popover) pedem o fechamento; quem usa devolve o foco ao gatilho. Uma pilha de painéis garante que `Esc` fecha só o do topo.

Por que não o `@angular/cdk`: (a) o escopo é pequeno (um painel, posicionamento por flip/shift e um trap de foco), cerca de 500 linhas testadas contra um pacote inteiro com `a11y`, `overlay`, `portal`, `scrolling` e `bidi`; (b) o orçamento inicial do bundle é 500 kB de aviso e 1 MB de erro (`angular.json`), e o CDK traz estratégias de rolagem e CSS de overlay próprios que precisaríamos reestilizar para os tokens (não medimos o tamanho final; o argumento é de escopo, não de orçamento); (c) o CDK desenha o overlay com o seu próprio contêiner global, `z-index` e animação, e isso brigaria com a camada de tokens (`--z-*`, `--shadow-popover`); (d) o comportamento que importa aqui (Safari não foca botão no clique, teclado virtual do iOS, `Tab` saindo do popover) precisa ser controlado e testado de qualquer jeito; terceirizá-lo não tira o teste, só esconde o código. O custo é manter o código, mitigado por specs do primitivo (`overlay/*.spec.ts`) e pelos testes de WebKit.

### 3. Bottom sheet até 640 px

`ViewportService` observa `(max-width: 640px)`. Até aí, o painel é folha inferior (alvos de 44 px, largura toda, encostada embaixo, `max-height: min(85dvh, 36rem)` descontando o teclado virtual); acima, popover. A troca com o painel aberto (rotação) é tratada: a trava de rolagem e o `inert` acompanham o modo, não só a abertura. Desktop e tablet em retrato largo ficam com popover.

### 4. Trava de rolagem, `inert` e anúncio

- Rolagem: `overflow: hidden` no `body` não segura o iOS Safari anterior ao 16 nem o "rubber band". O `body` passa a `position: fixed` com `top: -scrollY` e a rolagem é restaurada ao soltar (contagem para aninhar). `overscroll-behavior: contain` na folha e no diálogo.
- Fundo: um modal (folha ou `ConfirmDialog`) deixa o resto da página `inert` (foco, clique e cursor do leitor de tela), exceto regiões marcadas `data-modal-safe` (avisos). O `LiveAnnouncer` anuncia dentro do modal aberto, porque leitores que ocultam o que está fora de `aria-modal` descartariam o anúncio.
- Camadas: diálogo 50, popover 60, tooltip 70, aviso 80 (o erro de uma ação confirmada fica acima do diálogo).

### 5. Guarda estática (lint) e guarda de runtime (E2E)

- **Estática** (`scripts/check-native-controls.mjs`, parte do `npm run lint`): lê a AST do Angular (`parseTemplate` de `@angular/compiler`) e a AST do TypeScript, não regex. Proíbe as tags nativas, `input` com `type` fora da lista **permitida** (`text`, `email`, `password`), `type` dinâmico, `title`, `popover`, `contenteditable`, `ngNativeValidate`, `innerHTML`/`outerHTML`/`insertAdjacentHTML`, `createElement` de tag nativa ou dinâmica, `setAttribute`/`.type =` com tipo proibido, `alert/confirm/prompt` (inclusive `window['alert']`), `showPicker`, `showModal` e, no CSS, `accent-color`, `::-webkit-calendar-picker-indicator`, `::-webkit-datetime-edit` e `resize` diferente de `none`. Cada burla conhecida do regex anterior tem um caso em `check-native-controls.test.mjs`. Exceções só por `ALLOWLIST` (arquivo, regra, motivo): hoje só o `[type]` do `TextField`, limitado por tipo a text, email e password.
- **Runtime** (`e2e/native-controls.e2e.ts`): injeta um `MutationObserver` antes do primeiro quadro, percorre todas as rotas (inclusive o UI Kit), abre cada gatilho de overlay e falha se, a qualquer momento, existir um elemento, atributo ou chamada nativa (mesmo criado por `Renderer2`/`innerHTML` e removido logo depois). Um teste do teste prova que o detector enxerga cada caso.
- A guarda estática lê o código; a de runtime olha o DOM. Nenhuma das duas sozinha dá a garantia.

### 5.1 Exceção consciente: `type=password` e `type=email`

Continuam nativos por decisão: gerenciador de senhas, autofill e teclado de e-mail dependem deles. O botão "revelar senha" do Edge/Chromium é escondido (`::-ms-reveal`).

### 6. UI Kit

`/dev/ui-kit` mostra cada componente de base em todos os estados (padrão, foco, desabilitado, erro, cheio, vazio) nos dois temas (tokens por `[data-theme-scope]`). Só existe nos builds `development` e `mock`: `config/dev-routes.ts` (produção) é vazio e `dev-routes.dev.ts` o substitui por `fileReplacements`. O projeto `prod` do Playwright confere que a rota cai em "não encontrada" e que nenhum arquivo do bundle cita o UI Kit.

### 7. Dialog, Sheet e Menu: composição, não um segundo primitivo (gate G-UI-E3)

`Dialog`, `Sheet` e `Menu` são compostos a partir do `OverlayPanel` (FE-S-125): `mode="modal"` + `layout` (`bottom`, `center`, `side`, `responsive-center`, `responsive-side`) dão o diálogo, a folha e o painel lateral; o `Menu` usa `mode="auto"` e `popoverRole=null` (popover em tela larga, folha até 640 px). Herdam a pilha de `Esc`, o `inert` do fundo, a trava de rolagem, o foco preso (`overlay/focus-trap.ts`, extraído do `OverlayPanel` e do antigo trap do `ConfirmDialog`) e a devolução de foco. `ConfirmDialog` agora é um `Dialog` (mesma API, mesmos `data-cy`). Camadas: modais 50, popover e folha dos campos 60 (um `Select` dentro de um diálogo abre por cima). O `NumberStepper` trabalha só com inteiros (FE-S-126) e a `ProgressBar` só desenha a razão do backend (FE-S-129); nenhum faz cálculo financeiro.

## Alternativas consideradas

1. **Estilizar os controles nativos** (`appearance: none`, `::-webkit-*`): não alcança o `<select>` aberto nem o seletor de data do iOS e do Android; o que se vê é do sistema. Rejeitada.
2. **`@angular/cdk` (overlay, a11y) ou biblioteca de componentes (Angular Material, PrimeNG, Spartan)**: ver §2; teria de ser reestilizada para o DS e traria mais código do que usamos. Rejeitada por ora; reavaliar se surgirem muitos overlays (menus em cascata, virtualização).
3. **Popover API e `<dialog>` nativos**: são elementos do navegador (a Popover API só existe a partir do iOS 17) e fogem do critério "nenhum controle nativo". Rejeitada.
4. **Só a guarda estática**: regex, ou até AST, não vê o que acontece em execução. Por isso as duas.
5. **Deixar `type=date` no celular** (picker nativo do iOS é bom para muita gente): inconsistente com a máscara por idioma e impossível de testar nos dois motores. Rejeitada.

## Consequências

- **Positivas**: aparência e comportamento iguais em todos os navegadores; acessibilidade controlada e testada (axe, teclado, foco); sem dependência nova no bundle; a regra "nenhum controle nativo" passa a ser verificada por duas guardas.
- **Custo**: manter o `OverlayPanel`, o trap de foco e os componentes; cada novo tipo de campo (arquivo, hora) pede um componente próprio (o `FilePicker` da importação é pendência).
- **Estado exibido ao usuário**: o filtro "De/Até" das movimentações é opcional e a URL guarda `from=`/`to=` vazios para "período aberto".

## Medição e limitações no iOS Safari

O projeto Playwright `webkit-iphone` (iPhone 14) e `webkit-desktop` (Safari desktop) roda o motor WebKit contra o ambiente `mock` (`e2e/webkit.e2e.ts`): rotas principais sem rolagem horizontal, Select como folha com alvos de 44 px, DatePicker (máscara e escolha), trava de rolagem (posição preservada) e diálogo.

Achado e corrigido no WebKit: **o Safari não foca um botão ao clicar**; o foco vai para o ancestral com `tabindex` (`main`) ou para o `body`. O foco "de volta ao gatilho" voltava então para o `main`. Agora `overlay/focus-return.ts` usa o último alvo de toque como "quem abriu" e o `ConfirmDialog` devolve o foco depois de soltar o `inert` (elemento inerte recusa foco).

Limitações (não medidas): o WebKit do Playwright **não é o iOS Safari real**: não tem teclado virtual (a folha sobe pelo `visualViewport`, testado só por unidade), barra de endereço dinâmica (`dvh`), "rubber band" nem `mouse.wheel` em mobile (a trava é conferida por `scrollTo` e pelo estilo do `body`), nem zoom automático em campo com fonte < 16 px (a busca do Select usa 16 px por esse motivo). Pendência: uma passada manual em iPhone real (iOS 16 e 17) antes de fechar a etapa: teclado virtual sobre a folha com busca, rotação com painel aberto, rolagem do fundo e VoiceOver. Piso suportado assumido: iOS 16 (`inert`, `dvh`, `visualViewport`).
