import type { Routes } from '@angular/router';

/**
 * Rotas de desenvolvimento ligadas nos builds `development` e `mock` (substitui `dev-routes.ts`).
 * O mesmo formato de `dev-routes.ts`; nunca entra no build de produção.
 */
export const devRoutes: Routes = [
  {
    path: 'dev/ui-kit',
    loadChildren: () => import('~/app/features/dev/ui-kit/ui-kit.routes'),
  },
];
