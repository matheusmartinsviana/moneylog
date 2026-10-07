import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { BudgetsPage } from '~/app/features/budgets/pages/budgets.page';

const routes: Routes = [{ path: '', component: BudgetsPage, title: pageTitle('budgets') }];

export default routes;
