import { Routes } from '@angular/router';

import { AppShellComponent } from '~/app/common/components/app-shell/app-shell.component';
import { authGuard, guestGuard } from '~/app/common/guards/auth.guard';
import { devRoutes } from '~/app/config/dev-routes';

/**
 * Rotas lazy (FE 02): cada seção é um chunk próprio via `loadChildren` + `export default`.
 * Tudo fica dentro do shell, atrás do `authGuard`, exceto `/login`; rota desconhecida cai na página
 * "não encontrada".
 */
export const routes: Routes = [
  // Fora do shell (sem sidebar nem barra inferior).
  {
    path: 'login',
    canMatch: [guestGuard],
    loadChildren: () => import('~/app/features/login/login.routes'),
  },
  {
    path: '',
    component: AppShellComponent,
    canMatch: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadChildren: () => import('~/app/features/home/home.routes'),
      },
      {
        path: 'transactions',
        loadChildren: () => import('~/app/features/transactions/transactions.routes'),
      },
      {
        path: 'quick-add',
        loadChildren: () => import('~/app/features/quick-add/quick-add.routes'),
      },
      { path: 'goals', loadChildren: () => import('~/app/features/goals/goals.routes') },
      { path: 'more', loadChildren: () => import('~/app/features/more/more.routes') },
      { path: 'cards', loadChildren: () => import('~/app/features/cards/cards.routes') },
      { path: 'accounts', loadChildren: () => import('~/app/features/accounts/accounts.routes') },
      { path: 'planning', loadChildren: () => import('~/app/features/planning/planning.routes') },
      { path: 'people', loadChildren: () => import('~/app/features/people/people.routes') },
      { path: 'debts', loadChildren: () => import('~/app/features/debts/debts.routes') },
      { path: 'notes', loadChildren: () => import('~/app/features/notes/notes.routes') },
      { path: 'import', loadChildren: () => import('~/app/features/import/import.routes') },
      {
        path: 'notifications',
        loadChildren: () => import('~/app/features/notifications/notifications.routes'),
      },
      { path: 'insights', loadChildren: () => import('~/app/features/insights/insights.routes') },
      { path: 'budgets', loadChildren: () => import('~/app/features/budgets/budgets.routes') },
      { path: 'vault', loadChildren: () => import('~/app/features/vault/vault.routes') },
      { path: 'ai', loadChildren: () => import('~/app/features/ai/ai.routes') },
      { path: 'mcp', loadChildren: () => import('~/app/features/mcp/mcp.routes') },
      { path: 'settings', loadChildren: () => import('~/app/features/settings/settings.routes') },
      // Só em desenvolvimento/mock: em produção `devRoutes` é vazio (`config/dev-routes.ts`).
      ...devRoutes,
      { path: '**', loadChildren: () => import('~/app/features/not-found/not-found.routes') },
    ],
  },
];
