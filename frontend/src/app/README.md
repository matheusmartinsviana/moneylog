# `src/app`: apresentação

Tudo o que o usuário vê: shell, rotas, páginas e componentes visuais (FE 01).

**Entra:** `app.routes.ts` (rotas lazy), `app.config.ts` (bootstrap), `config/`, `common/`, `features/`.
**Não entra:** regra de negócio, chamadas HTTP, tipos de resposta da API.

Regras (verificadas por `npm run lint:deps`):

- `src/app` não importa `src/modules/*/infra` nem `mock-data`. Use a facade de negócio do `core`.
- Exceção única (S-31): `app.config.ts` liga a porta do `core` à implementação da `infra`.
- Componentes de `features/` e `common/components/` nunca importam `@angular/common/http`.
- Imports sempre por `~/*`; `../` é proibido (`import/no-relative-parent-imports`). Sem barrels `index.ts`.
