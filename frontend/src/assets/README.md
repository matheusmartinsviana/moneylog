# `src/assets`

Arquivos estáticos servidos em `/assets` (os README são ignorados no build).

- `icons/icon.svg` e `icons/icon-maskable.svg`: **ladrilhos lisos, sem logo, na cor de `surface-muted`** (o logo ainda não foi
  definido pelo dono). O PWA precisa de ícones para ser instalável, por isso o arquivo existe; quando a
  marca for definida, troque estes dois SVGs e rode `npm run icons`. Espaços reservados para o logo na
  interface: `.sidebar__logo-slot` (barra lateral) e `.login__logo-slot` (login).
- PNGs gerados por `npm run icons` (versionados): `icon-32`, `icon-192`, `icon-512`,
  `icon-maskable-192`, `icon-maskable-512` e `apple-touch-icon` (180×180).

As imagens ficam em cache `lazy` no service worker; o app shell, o CSS, o JS e as fontes latinas em `prefetch`.
