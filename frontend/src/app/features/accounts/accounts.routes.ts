import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { AccountFormPage } from '~/app/features/accounts/pages/account-form.page';
import { AccountsPage } from '~/app/features/accounts/pages/accounts.page';

const routes: Routes = [
  { path: '', component: AccountsPage, title: pageTitle('accounts') },
  { path: 'new', component: AccountFormPage, title: pageTitle('accounts') },
  { path: ':id/edit', component: AccountFormPage, title: pageTitle('accounts') },
];

export default routes;
