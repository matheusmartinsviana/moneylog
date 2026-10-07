import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { DebtPage } from '~/app/features/debts/pages/debt.page';
import { DEBTS_PROVIDERS } from '~/app/lazy-providers';

const routes: Routes = [
  {
    path: '',
    providers: DEBTS_PROVIDERS,
    children: [{ path: ':id', component: DebtPage, title: pageTitle('people') }],
  },
];

export default routes;
