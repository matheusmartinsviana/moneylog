import type { Routes } from '@angular/router';

/**
 * Rotas só de desenvolvimento (ex.: `/dev/ui-kit`). Aqui, no ambiente de produção, a lista é vazia:
 * nenhuma página de desenvolvimento entra no bundle. As configurações `development` e `mock` do
 * `angular.json` trocam este arquivo por `dev-routes.dev.ts` (`fileReplacements`), o único que
 * importa essas páginas. O `e2e/ui-kit.e2e.ts` (projeto `prod`) confere que o UI Kit não vai no build.
 */
export const devRoutes: Routes = [];
