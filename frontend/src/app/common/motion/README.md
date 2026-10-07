# Sistema de movimento

Estilos: `src/styles/motion.css`. Só `transform` e `opacity`. Sem biblioteca de animação (CSS, Web Animations, View Transitions).

## Tokens

Durações `--motion-instant` 90 · `fast` 160 · `base` 240 · `slow` 420 · `hero` 640 ms. Easings `--motion-ease` (padrão suave),
`-in`, `-out`, `-spring` (modais). Distâncias `--motion-dx` 8, `--motion-dy` 16, `--motion-dist-lg` 24 px. Cascata
`--motion-stagger` 50 ms por item, teto `--motion-stagger-max` 600 ms.

## Desligar

`data-motion="off"` no `<html>` (o setup de testes e o Playwright via `reducedMotion: 'reduce'`) ou `prefers-reduced-motion: reduce`.
`motionEnabled()` (`motion.ts`) é a checagem em TypeScript.

## Entrada de tela

- `appStagger` (`MotionStaggerDirective`): filhos diretos entram em ordem de leitura ao aparecer na viewport, uma vez.
  Filhos novos (dados que chegam depois) animam; os existentes não reanimam. `[appStaggerOffset]` desloca o início;
  `data-motion-skip` exclui um filho. `PageLayoutComponent` já aplica no conteúdo de toda página.
- `appReveal` (`MotionRevealDirective`): um elemento. `Revealer` (`reveal-engine.ts`) esconde por `.m-pending` (sem CLS),
  troca por `.m-enter` ao entrar e remove ao terminar (`will-change` só durante a animação).
- Sem `IntersectionObserver` ou com movimento desligado, o conteúdo nunca é escondido.

## Rotas, overlays, toasts

- `withViewTransitions` (`app.config.ts`): só o `<main class="m-page">` troca (sidebar e cabeçalho ficam); sem animar o 1º carregamento.
- `playGhostExit` (`ghost-exit.ts`): saída animada de modal/folha/painel/popover por um clone inerte; o original sai do DOM na hora.
- Toasts e banners: `animate.enter`/`animate.leave` do Angular com `.m-toast-*` e `.m-banner-*`.
- Tema: classe temporária `m-theme-switch` (só propriedades de cor). Valores de dinheiro nunca contam números.
