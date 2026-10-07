import { Routes } from '@angular/router';

import { quickAddModalGuard } from '~/app/common/guards/quick-add-modal.guard';
import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { QuickAddPage } from '~/app/features/quick-add/pages/quick-add.page';
import { QUICK_ADD_PROVIDERS } from '~/app/lazy-providers';

const routes: Routes = [
  {
    path: '',
    providers: QUICK_ADD_PROVIDERS,
    children: [
      // Na rota primária (`/quick-add?...`) o guard a converte em `<origem>(modal:quick-add)`; na auxiliar abre o modal.
      {
        path: '',
        component: QuickAddPage,
        title: pageTitle('quickAdd'),
        canActivate: [quickAddModalGuard],
      },
    ],
  },
];

export default routes;
