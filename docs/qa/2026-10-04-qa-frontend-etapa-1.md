# QA · T20 · Validação do frontend da Etapa 1

- **Plano:** `docs/planos/2026-10-03-etapa-1-dominio-arquitetura.md` (T20, que valida T13 a T19)
- **Data:** 2026-10-04 · **Agente:** tester
- **Ambiente:** macOS (Darwin 25.6), Node 24.17.0, npm 11.13.0, Angular 22.2.1, Playwright 1.63.0 com Chromium headless (build 1243)
- **Alvos E2E:** `dev` (`ng serve`) e `prod` (build de produção servido por `e2e/serve-dist.mjs`, com o service worker ativo)

## 1. Resumo

A suíte existente passa por completo: format, lint, lint:deps, typecheck, 143 testes unitários e build. Criei uma suíte E2E com Playwright (`npm run e2e`), que roda contra o `ng serve` e contra o build de produção e cobre tudo o que o jsdom não alcança:

- responsividade real em 375, 768 e 1280 px;
- navegação por todas as rotas nos idiomas pt, en e es;
- temas claro e escuro;
- foco e Tab;
- axe;
- PWA (manifest, service worker, instalabilidade e offline);
- console e rede.

Cada teste verifica automaticamente se há erro ou warning no console, requisição a terceiros, chamada a `/v1` e requisição com falha.

Resultado: **62 testes executados, todos com o resultado esperado. Os 9 de captura de evidência ficam desligados por padrão.** Um bug de acessibilidade ficou confirmado (BUG-01): o item ativo da sidebar perde o anel de foco. O teste dele está marcado com `test.fail()` até a correção. Encontrei também três achados menores (🟢).

## 2. Casos executados

### 2.1 Suíte existente (T20 CA 1)

Rodei duas vezes: antes de qualquer mudança minha e de novo no fim, já com o Playwright instalado. O resultado foi o mesmo nas duas.

| Comando                | Exit | Saída real (trecho)                                                                                                                                                           |
| ---------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`               | 0    | `added 540 packages, and audited 541 packages in 8s` · `found 0 vulnerabilities`                                                                                              |
| `npm run format:check` | 0    | `All matched files use Prettier code style!`                                                                                                                                  |
| `npm run lint`         | 0    | `All files pass linting.` · `check-styles: 104 arquivos verificados, nenhuma cor fora de tokens.css e nenhum gradiente.` · `check-contrast: 38 pares ≥ 4.5:1 nos dois temas.` |
| `npm run lint:deps`    | 0    | `✔ no dependency violations found (113 modules, 369 dependencies cruised)`                                                                                                    |
| `npm run typecheck`    | 0    | (sem saída: `ngc` + `tsc` sem erros)                                                                                                                                          |
| `npm test`             | 0    | `Test Files 16 passed (16)` · `Tests 143 passed (143)` · cobertura: Statements 97.56% · Branches 97.61% · Functions 90.64% · Lines 97.65%                                     |
| `npm run build`        | 0    | `Initial total 300.00 kB` (81.19 kB transferidos); chunks lazy por rota e `pt`/`en`/`es` em chunks separados; sem warning de budget                                           |
| `npm run e2e` (novo)   | 0    | `62 passed` · `9 skipped` (capturas, só com `E2E_EVIDENCE=1`) · 1m42s                                                                                                         |

O terminal do `ng serve` ficou limpo: só a tabela de chunks, `Application bundle generation complete` e `Local: http://localhost:4211/`, sem warning. As rotas `/`, `/cards`, `/settings` e `/x` responderam 200.

### 2.2 Violações de camada propositais (T20 CA 2)

Criei temporariamente quatro arquivos em `src/app/features/qa-tmp/` e `src/modules/dashboard/core/qa-tmp/`:

```
npm run lint:deps  → exit 4
  error no-circular: src/app/features/qa-tmp/qa-cycle-a.ts →
  error core-not-to-infra: src/modules/dashboard/core/qa-tmp/qa-core-infra.ts → src/modules/dashboard/infra/endpoints.ts
  error core-not-to-app: src/modules/dashboard/core/qa-tmp/qa-core-app.ts → src/app/common/i18n/i18n.service.ts
  error app-not-to-infra: src/app/features/qa-tmp/qa-feature-infra.ts → src/modules/dashboard/infra/facades/dashboard-requests.facade.ts
x 4 dependency violations (4 errors, 0 warnings). 118 modules, 374 dependencies cruised.
```

Removi os arquivos e rodei de novo: `npm run lint:deps` deu exit 0, com `✔ no dependency violations found (113 modules, 369 dependencies cruised)`. ✅

### 2.3 E2E com Playwright (T20 CA 3 a 6, T17, T18, T15 CA 1/3/5)

Os testes de shell, rotas, temas e axe rodam nos dois alvos (`dev` e `prod`). Os de PWA rodam só em `prod`.

| #   | Caso                                                                                                                                                                                                                                                                                                                                                          | dev                        | prod        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------- |
| 1   | 375 × 812: barra inferior com exatamente Início · Movimentações · + · Metas · Mais, nessa ordem; `position: fixed` encostada no rodapé; sem sidebar; "+" com destaque e navegando para `/quick-add`                                                                                                                                                           | ✅                         | ✅          |
| 2   | 375: navegar pela barra inferior troca a rota sem recarregar a página (marcador em `window` preservado); o item ativo visível tem `aria-current="page"`                                                                                                                                                                                                       | ✅                         | ✅          |
| 3   | 375: `/more` lista Cartões · Contas · Planejamento · Pessoas · Notas · Importar extrato · Insights · Configurações, e cada item abre a seção certa                                                                                                                                                                                                            | ✅                         | ✅          |
| 4   | 375: Tab percorre a barra inferior na ordem, todos com `:focus-visible` e anel de foco; Shift+Tab e Enter navegam                                                                                                                                                                                                                                             | ✅                         | ✅          |
| 5   | Link "Pular para o conteúdo" aparece no foco e leva o foco ao `<main>` sem trocar a URL                                                                                                                                                                                                                                                                       | ✅                         | ✅          |
| 6   | 768 × 1024: sidebar recolhida (< 100 px), sem barra inferior, 11 itens com nome acessível, rótulo escondido visualmente                                                                                                                                                                                                                                       | ✅                         | ✅          |
| 7   | 768: Tab alcança os 11 itens da sidebar com anel de foco, e o rótulo aparece como tooltip no foco                                                                                                                                                                                                                                                             | ✅                         | ✅          |
| 8   | 1280 × 800: sidebar expandida (> 180 px) com Início · Movimentações · Cartões · Contas · Planejamento · Metas · Pessoas · Notas · Importar extrato · Insights · Configurações; sem Dream Board                                                                                                                                                                | ✅                         | ✅          |
| 9   | 1280: o item **ativo** da sidebar focado por teclado mostra o anel de foco                                                                                                                                                                                                                                                                                    | ❌ (BUG-01, `test.fail()`) | ❌ (BUG-01) |
| 10  | 3 viewports × 3 idiomas (9 combinações): as 13 rotas e a rota desconhecida têm título correto, um `<h1>` e um `<main>`, `<html lang>` certo, estado vazio, nenhuma chave i18n crua e nenhum scroll horizontal; "Ir para o início" volta ao Início                                                                                                             | ✅                         | ✅          |
| 11  | Troca de idioma em Configurações (pt → en → es): atualiza títulos, sidebar e `<html lang>`, e a escolha persiste após reload                                                                                                                                                                                                                                  | ✅                         | ✅          |
| 12  | Navegador em `en-US` sem preferência salva: o padrão continua pt-BR (S-34)                                                                                                                                                                                                                                                                                    | ✅                         | ✅          |
| 13  | Tema sem preferência segue o sistema: canvas `rgb(247, 246, 243)` no claro e `rgb(22, 23, 25)` no escuro                                                                                                                                                                                                                                                      | ✅                         | ✅          |
| 14  | "Claro" escolhido com o sistema escuro: vale e persiste após reload; voltar para "Automático" remove `data-theme`                                                                                                                                                                                                                                             | ✅                         | ✅          |
| 15  | "Escuro" salvo com o sistema claro: vale                                                                                                                                                                                                                                                                                                                      | ✅                         | ✅          |
| 16  | `prefers-reduced-motion: reduce` zera as transições do shell                                                                                                                                                                                                                                                                                                  | ✅                         | ✅          |
| 17  | Fontes Geist carregadas (`document.fonts`) e servidas pelo próprio domínio                                                                                                                                                                                                                                                                                    | ✅                         | ✅          |
| 18  | axe-core 4.13 em todas as rotas (375 e 1280, claro e escuro): **0 violações críticas ou sérias**. Achado moderado na BUG-03                                                                                                                                                                                                                                   | ✅                         | ✅          |
| 19  | Manifest: `name`/`short_name` = moneylog, `standalone`, `start_url`/`scope` = `./`, `background_color`/`theme_color` = `#f7f6f3` (canvas claro); todos os ícones respondem 200; PNGs com as dimensões declaradas (192, 512, maskable 192/512); `apple-touch-icon` 180×180; `apple-mobile-web-app-capable`; `viewport-fit=cover`; `theme-color` dark `#161719` | n/a                        | ✅          |
| 20  | Service worker `ngsw-worker.js` ativo e controlando a página; CDP `Page.getAppManifest` sem erros; **`Page.getInstallabilityErrors` = `[]`** (instalável)                                                                                                                                                                                                     | n/a                        | ✅          |
| 21  | `ngsw.json`: `index.html`, `main-*.js`, `styles-*.css` e as fontes Geist/Geist Mono latin em `prefetch`; imagens em `lazy`; **sem `dataGroups`**                                                                                                                                                                                                              | n/a                        | ✅          |
| 22  | Offline depois da primeira carga: `/cards` abre pelo SW, e as fontes Geist vêm do cache                                                                                                                                                                                                                                                                       | n/a                        | ✅          |
| 23  | Em todos os testes acima: console sem erro nem warning (inclui `pageerror`), nenhuma requisição a terceiros, nenhuma chamada a `/v1` e nenhuma requisição com falha                                                                                                                                                                                           | ✅                         | ✅          |

O caso 9 conta como "esperado" na contagem, porque está marcado com `test.fail()`. Quando o BUG-01 for corrigido, o Playwright vai acusar "passou inesperadamente", e aí o `test.fail()` deve sair.

**Instalabilidade:** o Lighthouse atual (12+) não tem mais a categoria PWA. Usei a mesma checagem do Chrome DevTools → Application, pelo CDP (`Page.getInstallabilityErrors`), contra o build de produção servido em `http://localhost:4300`. `localhost` é contexto seguro, então não precisei de HTTPS local.

### 2.4 Evidências (screenshots)

Ficam em `docs/qa/evidencias/etapa-1/`, foram gerados com `E2E_EVIDENCE=1 npm run e2e -- --project=prod evidence` e conferi um por um visualmente.

| Viewport | Claro                                                                                                                                                                             | Escuro                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 375      | `375-claro-inicio.png`, `375-claro-mais.png`, `375-claro-configuracoes.png`                                                                                                       | `375-escuro-inicio.png`, `375-escuro-mais.png`, `375-escuro-configuracoes.png` |
| 768      | `768-claro-inicio.png`, `768-claro-cartoes.png`                                                                                                                                   | `768-escuro-inicio.png`, `768-escuro-cartoes.png`                              |
| 1280     | `1280-claro-inicio.png`, `1280-claro-configuracoes.png`                                                                                                                           | `1280-escuro-inicio.png`, `1280-escuro-configuracoes.png`                      |
| Foco     | `375-claro-foco-bottom-nav.png` (anel no "+"), `768-claro-foco-sidebar.png` (anel e tooltip "Cartões"), `1280-claro-foco-item-ativo.png` (**BUG-01**: item ativo focado sem anel) |                                                                                |

## 3. Bugs

### BUG-01 · O item ativo da sidebar perde o anel de foco · 🟠

- **Passos:**
  1. `npm start` e abrir `http://localhost:4200/transactions` em 1280 × 800 (o mesmo acontece em 768 × 1024).
  2. Clicar em qualquer ponto da página e apertar Tab até passar por "Início".
  3. Apertar Tab mais uma vez: o foco vai para "Movimentações", o item ativo.
- **Esperado:** o anel de foco (`--focus-ring`, `0 0 0 2px canvas, 0 0 0 4px focus`) aparece também no item ativo (T17 CA 5: "alcançáveis por teclado com foco visível"; WCAG 2.4.7).
- **Obtido:** o elemento está com `:focus-visible = true`, mas o `box-shadow` calculado é `rgba(35, 35, 38, 0.06) 0px 1px 2px 0px` (`--shadow-1`). O foco fica invisível justamente no item da página atual. O "Novo registro" da sidebar faz o mesmo quando `/quick-add` está ativo, porque usa a mesma classe.
- **Evidência:** `e2e/shell.e2e.ts`, teste "o item ativo da sidebar continua com foco visível" (dev e prod):
  ```
  Error: anel de foco no item ativo
  Expected pattern: /0px 0px 0px 4px/
  Received string:  "rgba(35, 35, 38, 0.06) 0px 1px 2px 0px"
  ```
  Na primeira versão do teste de Tab no tablet, a mesma falha apareceu em `sidebar-notes` com `/notes` ativo. Captura: `docs/qa/evidencias/etapa-1/1280-claro-foco-item-ativo.png`.
- **Causa provável:** em `sidebar.component.css`, `.sidebar__link.is-active { box-shadow: var(--shadow-1); }` tem especificidade (0,2,0) e vence `:focus-visible { box-shadow: var(--focus-ring); }` (0,1,0) de `base.css`. A correção fica com o dev, por exemplo com uma regra `.sidebar__link:focus-visible` que combine as duas sombras.
- **Camada:** front.

### BUG-02 · "Movimentações" aparece truncado na barra inferior em 375 px · 🟢

- **Passos:** abrir qualquer rota em 375 × 812, com o idioma pt.
- **Esperado:** rótulos da barra inferior legíveis (DS 00).
- **Obtido:** aparece "Moviment…" (`text-overflow: ellipsis`). O nome acessível continua completo e não há scroll horizontal.
- **Evidência:** `375-claro-inicio.png`, `375-escuro-mais.png`.
- **Camada:** front (UX/copy). Caminhos possíveis: um rótulo curto específico da barra (ex.: "Extrato"/"Mov.") ou fonte menor. A decisão é de produto/UX.

### BUG-03 · axe `region` (moderado): marca e "Novo registro" da sidebar fora de landmarks · 🟢

- **Passos:** abrir qualquer rota em 1280 × 800 e rodar o axe (o `e2e/theme-a11y.e2e.ts` registra a anotação).
- **Esperado:** todo conteúdo dentro de um landmark.
- **Obtido:** `region: All page content should be contained by landmarks → .sidebar__brand-name | .sidebar__quick-add > .sidebar__label`, em todas as rotas, nos dois temas e só no desktop (no mobile e no tablet os rótulos estão ocultos). Não há violação crítica nem séria.
- **Causa provável:** o link da marca e o atalho "Novo registro" ficam no `div.sidebar`, fora do `<nav>`.
- **Camada:** front.

### BUG-04 · O mesmo destino tem dois nomes: "Novo registro" e "Captura rápida" · 🟢

- **Passos:** em 1280, ler o botão do topo da sidebar ("Novo registro", chave `shell.quickAdd`) e clicar nele. O título da página é "Captura rápida" (`nav.quickAdd`), que também é o nome acessível do "+" da barra inferior.
- **Esperado:** um nome só para a ação (DS 00, voz consistente).
- **Obtido:** dois rótulos diferentes para a mesma rota `/quick-add`.
- **Camada:** front (i18n/copy). A decisão é de produto/UX.

## 4. Testes adicionados

Todos ficam em `frontend/`. Nenhum código de produção foi alterado.

| Arquivo                 | Conteúdo                                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `playwright.config.ts`  | projetos `dev` (`ng serve`, porta 4200) e `prod` (build + `e2e/serve-dist.mjs`, porta 4300); o Playwright sobe e encerra os dois servidores                                              |
| `e2e/support.ts`        | fixture automático que observa console, rede e `/v1`; viewports, rotas e rótulos esperados nos 3 idiomas; helpers de scroll horizontal, chave crua e axe (usa o `axe-core` já instalado) |
| `e2e/shell.e2e.ts`      | casos 1 a 12                                                                                                                                                                             |
| `e2e/theme-a11y.e2e.ts` | casos 13 a 18                                                                                                                                                                            |
| `e2e/pwa.e2e.ts`        | casos 19 a 22 (só `prod`)                                                                                                                                                                |
| `e2e/evidence.e2e.ts`   | capturas de evidência; rodam só com `E2E_EVIDENCE=1`, para não reescrever arquivos versionados a cada execução                                                                           |
| `e2e/serve-dist.mjs`    | servidor estático sem dependências, com fallback de SPA para servir o build de produção                                                                                                  |
| `e2e/tsconfig.json`     | typecheck da suíte (`npx tsc -p e2e/tsconfig.json` passa)                                                                                                                                |

Mudanças de ferramenta:

- `@playwright/test` **1.63.0** como devDependency exata, com o `package-lock.json` atualizado;
- script `"e2e": "playwright test"` no `package.json`;
- `/e2e/.results` e `/playwright-report` no `.gitignore`, e `e2e/.results` e `playwright-report` no `.prettierignore`.

Os arquivos E2E passam no `prettier --check` e no `eslint`.

Para rodar, o Chromium do Playwright precisa estar instalado: `npx playwright install chromium`, uma vez por máquina. Depois é `npm run e2e`. As portas 4200 e 4300 precisam estar livres.

## 5. Riscos e pendências

- **Navegadores:** testei só no Chromium. Faltam Safari iOS, que é o alvo principal da PWA (instalação via "Adicionar à Tela de Início", safe areas reais e `apple-touch-icon`), Firefox e WebKit. As metas iOS foram checadas só estaticamente. Vale um teste manual num iPhone, ou um projeto `webkit` no Playwright.
- **`MoneyPipe` no navegador:** o mock é vazio, então nenhum valor monetário aparece na tela. A ausência de `NG0701` no console vale para as telas da Etapa 1, mas a formatação real (T14 CA 4) só tem cobertura nos testes unitários.
- **Estado ativo no mobile:** em seções que ficam sob "Mais" (ex.: `/cards`, `/settings`), nenhum item da barra inferior fica marcado. Não fere critério de T17, mas o usuário perde a referência de onde está. Fica como sugestão de UX: marcar "Mais".
- **Integração contínua:** a suíte `e2e/` não está no `typecheck` nem no pre-commit. Ela roda à parte, por `npm run e2e`. Sugiro ligá-la no CI quando ele existir.
- **Integridade financeira (PR 01):** não se aplica nesta task, porque o front não calcula nada e o mock é vazio. A revisão de T19 já cobre que não existe soma no front. Nenhuma requisição a `/v1` aconteceu.
- `dist/` e `coverage/` foram regenerados pelas execuções e são ignorados pelo git. Não subi servidor fora do controle do Playwright, exceto um `ng serve` na porta 4211 para registrar a saída do terminal, já encerrado. Não deixei nenhum processo aberto.

## 6. Parecer

**🟡 Aprovado com ressalvas.**

Todos os critérios de T20 foram verificados no navegador real e passam, com uma exceção:

- build, camadas, PWA instalável e offline, responsividade sem scroll horizontal nos três tamanhos, três idiomas sem chave crua, temas reais, axe sem violação crítica ou séria, console limpo em `ng serve` e no build, nenhuma requisição a terceiros nem a `/v1`;
- a exceção é o foco visível no item ativo da sidebar (BUG-01, 🟠), que fere o T17 CA 5 e a WCAG 2.4.7.

A correção é localizada no CSS da sidebar e não bloqueia o restante da etapa, mas o BUG-01 precisa voltar para o dev-frontend antes de fechar o T17. O teste com `test.fail()` vai confirmar a correção. Os achados 🟢 (BUG-02 a 04) podem entrar como melhoria, com decisão de produto/UX nos BUG-02 e 04.

---

## Reteste (2026-10-04)

- **BUG-01 🟠: corrigido.** `.sidebar__link.is-active:focus-visible` agora combina o anel de foco com a sombra do item ativo. O `test.fail()` foi removido, o teste passa e há um teste novo para o "Novo registro" ativo.
- **BUG-03 🟢: corrigido.** A marca e o "Novo registro" ficaram dentro do `nav` "Navegação principal". O teste de axe agora falha também na regra `region`.
- Suíte: 144 testes unitários e `npm run e2e` com 64 passed / 9 skipped (capturas). Evidências regeradas com `E2E_EVIDENCE=1` (9 passed). Veja `evidencias/etapa-1/1280-claro-foco-item-ativo.png`.
- **BUG-02 e BUG-04** continuam abertos e dependem de decisão de produto/UX.

**Parecer atualizado: ✅ Aprovado** (frontend da Etapa 1).
