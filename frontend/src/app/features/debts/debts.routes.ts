import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { DebtPage } from '~/app/features/debts/pages/debt.page';

const routes: Routes = [{ path: ':id', component: DebtPage, title: pageTitle('people') }];

export default routes;
