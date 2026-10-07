---
tipo: revisão de código
escopo: etapa de UI própria (frontend/): overlay, Select, DatePicker, Calendar, MonthPicker, Checkbox, Switch, Disclosure, Tooltip e guarda check-native-controls
data: 2026-10-06
revisor: agente revisor
referências:
  - docs/planos/2026-10-05-etapa-ui-propria.md
  - docs/revisoes/2026-10-05-revisao-planos-etapas-3-9.md (§5 reconciliação)
  - design/DS 00 e DS 01 (vault)
fora do escopo: correção de retry do dashboard, ADR-007, `/dev/ui-kit` e projeto WebKit do Playwright (em andamento por outro dev)
---

# Revisão do código da UI própria

## 1. Resumo

Base sólida e bem pensada: o `OverlayPanel` único (popover ou folha), o padrão select-only combobox do APG, o calendário por dias civis em UTC, a máscara por idioma e a guarda com teste de si mesma. A migração das telas está feita e a guarda passa (`check-native-controls: nenhum controle nativo encontrado`). Não achei bug financeiro nem cálculo no front; datas são strings `YYYY-MM-DD` e o fuso é `America/Sao_Paulo`.

Os problemas reais estão em quatro pontos:

1. **A guarda é burlável** (regex, não parser): 12 formas de burlar confirmadas por execução (§3.1). Para a exigência do usuário ("nenhum controle nativo"), ela sozinha não garante; falta o teste de runtime do T154 (critério 7).
2. **Teclado no popover do calendário/mês**: `Tab` sai do painel e o painel continua aberto, com o foco indo para o fim do `body` (portal) e depois para fora da página.
3. **Filtro de período não pode ser limpo** (DatePicker obrigatório nos filtros): bug de uso na tela principal.
4. **Primitivo mais arriscado sem testes próprios**: `overlay-panel`, `popover-positioner`, `scroll-lock`, `live-announcer` e `viewport.service` não têm spec.

Testes dos componentes: rodei `ng test` em `common/components` (158 testes). Numa execução, 7 falharam; na segunda, só 1 (`app-shell`, "Test timed out in 5000ms"). São estouros de tempo sob carga (outro dev rodando em paralelo), não falha de asserção; vale conferir o timeout em CI.

## 2. Itens conformes

- `Select`: combobox select-only correto (`role=combobox`, `aria-expanded`, `aria-controls` só aberto, `aria-activedescendant`, typeahead, Home/End, Esc, `Tab` fecha sem escolher, `Enter` com `preventDefault` não envia o form), busca com normalização de acentos e anúncio de contagem. Fonte 16 px na busca (sem zoom do Safari).
- `Calendar`: `role=grid`, roving tabindex, setas/Home/End/PageUp/PageDown/Shift+Page, `aria-label` completo do dia por `Intl` em UTC, `aria-current=date`, `aria-selected`, dias fora do intervalo com `aria-disabled`, anúncio de mês.
- `calendar-math`: `setUTCFullYear` (ano 0 a 99 não vira 1900), fim de mês no `addMonths`, grade 6x7, limites 2000-01-01/2100-12-31, ordem `mdy` só em inglês, semana na segunda só em espanhol. Sem `new Date()` local; `todayIso` usa `Intl` com `America/Sao_Paulo`.
- `DatePicker`: valor `YYYY-MM-DD`, validação de 31/02, incompleta e fora do intervalo, colar ISO, apagar sobre a barra, `inputmode=numeric` (nenhum picker nativo do iOS), erro só depois de `touched`.
- `OverlayPanel`: pilha de painéis (Esc fecha só o do topo, em fase de captura com `stopPropagation`), listeners removidos no cleanup do `effect` e no `ngOnDestroy`, portal com marcador `Comment` devolvido ao fechar, devolução de foco só se o foco ficou no `body`, `visualViewport` para o teclado virtual, `try/catch` ao devolver foco com a view destruída.
- `Disclosure`: `inert` por `[attr.inert]` correto, `aria-expanded`/`aria-controls`, animação por `grid-template-rows`.
- `Checkbox`/`Switch`: `button role=checkbox|switch`, `aria-checked`, alvo 44 px, `forced-colors`, estado não só por cor.
- Camadas, `data-cy`, tokens (`--z-*`, `--shadow-popover`), `check-styles` verde, i18n tipado nos 3 idiomas (a interface `Translations` impede chave faltando).
- Sem cálculo financeiro no front. `util/date` e `list-filters` usam `Date.UTC`.

## 3. Achados

### 🔴 Críticos

Nenhum.

### 🟠 Altos

**A1 · 🟠 · `frontend/scripts/check-native-controls.mjs:76-91, 112, 143` · a guarda é burlável por regex**
Confirmei por execução que **nenhum** destes é detectado (todos devolvem `[]`):

| Burla                                                       | Por que passa                                     |
| ----------------------------------------------------------- | ------------------------------------------------- |
| `<input type=date>` (sem aspas)                             | `staticType` exige aspas (linha 78)               |
| `<input type="{{k}}">`                                      | interpolação não é `[type]`                       |
| `<input [disabled]="a > b" type="date">`                    | `<input\b[^>]*>` (linha 76) corta no primeiro `>` |
| `<button (click)="a>b" title="x">`                          | `[^<>]*?` (linha 87) falha com `>` em atributo    |
| `<input bind-type="k">`                                     | só `[type]`/`[attr.type]`                         |
| `template: '<select>…'` (aspas simples)                     | só `template: \`` (linha 112)                     |
| `styles: ['input{accent-color:red}']`                       | só `styles: \``                                   |
| ``document.createElement(`select`)`` e `createElement(tag)` | só literal com `'` ou `"` (linha 143)             |
| `el.type = 'date'`, `el.setAttribute('type','date')`        | nunca varre atribuição em TS                      |
| `el.innerHTML = '<select>…'`, `insertAdjacentHTML`          | não varre                                         |
| `host: { '[attr.title]': … }` em TS                         | `title` só em template                            |
| `window['alert'](…)`                                        | só `alert(`/`window.alert(`                       |

Também não cobre `popover`/`popovertarget` (Popover API nativa), `contenteditable`, `<form>` sem `novalidate` (o Angular põe `novalidate` sozinho, mas `ngNativeValidate` o desliga), `type=tel|url|hidden` (liberados por omissão) e `resize` em textarea (ver A5).
**Impacto:** a regra "nenhum controle nativo" pode regredir sem o lint acusar.
**Correção:** (a) trocar as regexes de template por `@angular/compiler` `parseTemplate` (ou regras `@angular-eslint/template` com `no-restricted-syntax`/seletor de AST, que já rodam no `ng lint`), cobrindo atributo estático, `[attr.*]`, `bind-*`, interpolação e `title`; no TS, usar o AST do `typescript` para `createElement`, `setAttribute`, `.type =`, `innerHTML`; (b) **entregar o teste de runtime do T154 (critério 7, `e2e/native-controls.e2e.ts`)**: percorre as rotas e falha se o DOM tiver `select, datalist, details, progress, meter, dialog, [popover], [title], input[type=date|…]` ou evento de `alert/confirm/prompt`. É o único que pega Renderer2/`innerHTML`/atributos dinâmicos de verdade; hoje não existe; (c) declarar uma lista **permitida** de `type` (`text|email|password`) em vez de só uma lista proibida, para `tel`, `url`, `hidden` e futuros.

**A2 · 🟠 · `overlay-panel.component.ts:303-323` + `date-picker.component.ts` + `month-picker.component.ts` · `Tab` no popover do calendário/mês**
O trap de foco só vale em folha (`!this.sheet()` retorna). No popover, o painel é movido para o fim do `body` (portal) e **não** fecha com `Tab`: o foco sai do calendário para o botão "Hoje/Ontem/Limpar" e depois para a UI do navegador, com o painel flutuando aberto; `Shift+Tab` no primeiro item vai para o fim do documento, não para o campo. O `Select` resolve isso (Tab fecha e devolve o foco), o calendário e o mês não.
**Impacto:** usuário de teclado fica preso num painel que não tem como voltar ao campo sem `Esc`; leitor de tela perde o contexto.
**Correção:** no `OverlayPanel` em modo popover, tratar `Tab` no `keydown` do painel: ou (i) fechar e devolver o foco ao gatilho (como o `Select`), ou (ii) circular entre os focáveis do painel (trap leve, como diálogo não modal do APG date picker). Acrescentar `focusout` com `relatedTarget` fora do painel e do gatilho como rede de segurança. Teste de teclado: abrir, `Tab` até o fim, esperar que o foco volte ao campo/gatilho.

**A3 · 🟠 · `features/transactions/components/filters-bar/filters-bar.component.html:20-29` · filtro "De/Até" não pode ser limpo**
Os dois `app-date-picker` ficam com `mandatory=true` (padrão): apagar o texto marca `required`, e o `valueChanges` (`filters-bar.component.ts`, `if (value && DATE.test(value))`) só emite `patch` para valor válido. Resultado: o campo aparece vazio com erro, **mas a URL e a lista continuam filtradas** pela data antiga. O painel também não oferece "Limpar" (só aparece com `!mandatory`). Único caminho é o botão "Limpar" geral.
**Impacto:** tela principal, estado inconsistente entre campo e filtro ("não chutar estado").
**Correção:** `[mandatory]="false"` nos dois; no `valueChanges` emitir `patch({ [key]: null })` quando o texto estiver vazio (e ignorar parcial). Teste: apagar "De" remove `from` da URL.

**A4 · 🟠 · `common/components/overlay/*` · sem testes do primitivo mais arriscado**
Não há spec de `overlay-panel`, `popover-positioner` (flip/shift/limites), `scroll-lock` (contagem/aninhado), `live-announcer` nem `viewport.service`. Os specs dos componentes cobrem abertura e Esc, mas não: devolução de foco ao fechar, pilha com dois painéis (Esc fecha só o do topo), listeners removidos ao destruir com painel aberto, portal devolvido ao lugar, trap em folha (Tab/Shift+Tab), `keyboardOffset`. Os poucos testes do `Select` compacto cobrem só "abre como dialog".
**Correção:** `overlay-panel.spec.ts` (pilha, foco, portal, destruição aberta, trap), `popover-positioner.spec.ts` (tabela: cabe abaixo, vira acima, falta espaço nos dois, `shift` nas bordas, mínimo 120 px) e `scroll-lock.spec.ts`.

### 🟡 Médios

**M1 · 🟡 · `overlay/scroll-lock.ts:5-9`, `overlay-panel.component.ts:340` · rolagem de fundo no iOS**
`body.style.overflow='hidden'` basta no iOS Safari >= 16; antes disso e no rubber-band não segura, e `base.css` já usa `overflow-x:hidden` no `body`. Só a folha trava; o `ConfirmDialog` (modal) **não trava nada** e o fundo rola por trás no celular. A trava acontece só em `onOpen` (`??=`): se a tela girar e o painel passar de popover para folha com ele aberto, não trava. Sem `overscroll-behavior: contain` na folha (só na lista do `Select`, `select.component.css:95`).
**Correção:** `lockScroll` também no `ConfirmDialog`; `overscroll-behavior: contain` no `.panel--sheet`/`.dialog`; ligar a trava a `sheet()` (efeito) e não só à abertura; se a ADR-007 exigir iOS < 16, usar `position: fixed` com guarda do `scrollY`.

**M2 · 🟡 · `overlay-panel.component.ts:44-88` · fundo não fica `inert` / `aria-hidden`**
`aria-modal` sozinho não é honrado por todos os leitores; o plano (T155) previa `inert` no fundo. Hoje o foco fica preso por JS, mas o cursor virtual do VoiceOver alcança o conteúdo de trás. O `LiveAnnouncer` também cria a região `aria-live` no `body`, **fora** do diálogo modal: em leitor que oculta o que está fora do `aria-modal`, o anúncio de "3 opções" e de mês trocado pode ser descartado.
**Correção:** `inert` no contêiner do app enquanto houver folha/diálogo aberto (contagem, junto da trava) e, para o anúncio dentro de modal, mover/duplicar a região para dentro do painel aberto.

**M3 · 🟡 · `styles/tokens.css:79-81` · `--z-toast: 40` abaixo de `--z-dialog: 50`**
Toast de erro de uma ação confirmada no diálogo (`accounts.page.ts:111`, `categories.page.ts:220`) fica atrás do escurecimento do diálogo se o diálogo ainda estiver aberto, e o leitor de tela (modal) não o lê. Popover 60 e tooltip 70 estão certos.
**Correção:** `--z-toast` acima de `--z-dialog` (ex.: 55) e fechar o diálogo antes do toast, ou o erro dentro do diálogo (`role=alert`).

**M4 · 🟡 · `overlay-panel.component.ts:243-253, 293` · primeiro quadro em (0,0) e altura medida antes da largura**
`position` começa em `{top:0,left:0}` e só é calculada em `afterNextRender`: o popover pode piscar no canto da tela. A altura natural usada no flip é medida antes de a `width` ser aplicada (`matchWidth`), então listas com texto longo calculam errado e podem abrir para cima sem necessidade.
**Correção:** `visibility:hidden` até a primeira posição, e posicionar duas vezes (largura, depois altura). Na folha com busca aberta, `max-height: min(85dvh, 36rem)` ignora o teclado; descontar `keyboardOffset`.

**M5 · 🟡 · `calendar.component.ts:362-366` · `Math.min(dia, 28)` ao trocar de mês**
Em 31/10, escolher "nov" na grade de meses foca 28/11 em vez de 30/11 (e dez, 28/12 em vez de 31). O valor só muda se o usuário confirmar, mas o foco mente.
**Correção:** `Math.min(dia, daysInMonth(y, m))` (já exportada).

**M6 · 🟡 · `date-picker.component.ts:266` · "hoje" calculado uma vez**
`computed(() => todayIso())` não tem dependência reativa: um PWA aberto atravessando a meia-noite mantém "Hoje/Ontem" e `aria-current` errados até recarregar. O mesmo em `month-picker.component.ts:155`.
**Correção:** reavaliar ao abrir o painel (`open()` como dependência) ou um relógio compartilhado de "hoje".

**M7 · 🟡 · `forms/switch/switch.component.ts:38-41` · estado dito duas vezes**
O texto "Ligado/Desligado" fica dentro do `button`, entra no nome acessível e o leitor ainda lê o `aria-checked`: "Notificações Ligado, interruptor, ligado". **Correção:** `aria-hidden="true"` no `.switch__state` (o estado visual redundante).

**M8 · 🟡 · `month-picker.component.ts:179-181` · `MonthPicker` sem validação de faixa e sem limpar**
`MonthPicker.validate()` só checa `required`; `min`/`max` entram só na grade, então valor vindo da URL fora do intervalo passa. E com `mandatory=false` não há como limpar o mês.

**M9 · 🟡 · `login.page.html:20` e `confirm-dialog.component.css:42` · UI nativa que sobrou**

- `type="password"` (via `app-text-field`): é permitido na guarda e **deve ficar** (gerenciador de senhas e acessibilidade), mas traz UI do navegador: o botão de revelar do Edge/Chromium (`::-ms-reveal`), a sugestão de senha forte do Safari e o menu de autofill. Risco: baixo; `type=email` só traz teclado e autofill. **Correção:** `input::-ms-reveal { display: none }` e, se quiser revelar, um botão próprio "mostrar senha" (ícone "olho" do FE-S-122); documentar na guarda que `password`/`email` são exceção consciente.
- `textarea` do `ConfirmDialog` com `resize: vertical`: desenha a alça de redimensionar nativa. **Correção:** `resize: none` e altura fixa.

### 🟢 Baixos

- **B1** `calendar.component.ts:67,296`: concatenação de frases (`chooseMonthYear + ': '`) e `replace('{month}')` em vez de `interpolate` (FE 04).
- **B2** `i18n`: chaves `form.date.weekdays`, `form.ui.expand` e `form.ui.collapse` sem uso (3 idiomas).
- **B3** `tooltip.directive.ts` + `utilities.css:236`: balão com `pointer-events:none` não é "hoverable" (WCAG 1.4.13); `setTimeout` de 1800 ms em `cancelPress` não é cancelado no destroy. Sem uso no app ainda.
- **B4** `disclosure.component.ts:36-40`: cabeçalho não está dentro de um `h3`; `role=region` em cada seção polui os marcos quando há várias. `everOpened` só muda por clique, então abrir por `[(open)]` e fechar destrói o conteúdo `lazy`.
- **B5** `select.component.html:101`: o item "sem resultados" é `role=option` com `aria-selected=false`; melhor um `role=status` fora da lista (ou `aria-live`), não uma opção.
- **B6** `select.component.ts:191-195`: com lista aberta sem busca no desktop, o foco fica no campo e `blur` fecha; o `mousedown` na barra de rolagem da lista (com mais de ~8 opções) pode tirar o foco do campo e fechar a lista. Verificar no Safari/Firefox.
- **B7** `overlay-panel.component.ts:27`: `FOCUSABLE` não ignora elementos ocultos nem inclui `select`/`[contenteditable]`; ok hoje, frágil amanhã. `confirm-dialog.component.ts` repete o mesmo trap (duplicação; extrair `focus-trap.ts`, previsto no plano).
- **B8** `date-picker.component.ts:345-350`: ao fechar o calendário por escolha, `touched` só dispara no próximo `focusout`.

## 4. Controles nativos remanescentes (leitura das rotas e formulários)

Rodei mentalmente login, contas (lista e formulário), categorias, lançamentos (filtros, detalhe, estorno, edição), quick-add (caixa, transferência, investimento, ajuste, estorno), configurações e shell. Não achei `<select>`, `<details>`, `type=date|month|checkbox|search|number`, `title`, `alert/confirm/prompt`, `<dialog>`, `<progress>` nem `<meter>`. O que ainda é do navegador: alça de `resize` do textarea (M9), botão de revelar senha do Edge (M9), autofill do navegador em campos sem `autocomplete` (o `TextField` não define padrão; as telas passam `off`, mas um novo uso esquecerá), barras de rolagem do sistema e `confirm`/`Notification` futuros (Etapa 7). Nada de `input type=file` ainda: o `FilePicker` próprio é pendência da importação.

## 5. Riscos

- Regressão silenciosa de controle nativo enquanto a guarda for só regex e não houver teste de runtime (A1).
- Teclado/leitor de tela em popover de calendário (A2) e fundo não `inert` (M2) são o que mais separa o resultado do "premium acessível" do DS.
- iOS: `overflow:hidden` + `visualViewport` cobrem iOS >= 16; abaixo disso e na folha com teclado (M1, M4) precisam de teste real no WebKit (o projeto Playwright WebKit em andamento é o lugar certo).
- A faixa 2000-01-01 a 2100-12-31 está hardcoded em três lugares (`calendar-math`, `month-grid`, `month-picker`); deve virar uma constante única do contrato.

## 6. Pendências por dono

- **Frontend:** A1 a A4, M1 a M9 e B1 a B8.
- **UX:** confirmar `resize` e revelar senha (M9); regra de "limpar" em filtros de período (A3); ordem de camadas toast × diálogo (M3).
- **Arquitetura:** a ADR-007 deve registrar a exceção de `type=password|email`, o piso do iOS (>= 16 ou não) e a política de `inert`/anúncio dentro de modal.
- **Produto/Backend:** nenhuma.

## 7. Parecer

**🟡 Aprovado com ajustes.**
A implementação dos componentes está acima da média e fiel ao APG, e a migração das telas está completa: não há controle nativo visível hoje. Mas a exigência do usuário é uma **garantia** ("nenhum pode aparecer"), e a guarda atual não a dá (A1); o `Tab` no popover do calendário (A2) e o filtro de período que não limpa (A3) são defeitos de uso reais, e o overlay não tem testes (A4). Corrigidos A1 a A4, aprovo; os 🟡 podem entrar na task seguinte com dono e data.
Não corrigi código nem fiz commits.
