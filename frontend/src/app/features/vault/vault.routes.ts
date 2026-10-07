import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { VaultPage } from '~/app/features/vault/pages/vault.page';
import { VAULT_PROVIDERS } from '~/app/lazy-providers';

const routes: Routes = [
  {
    path: '',
    providers: VAULT_PROVIDERS,
    children: [{ path: '', component: VaultPage, title: pageTitle('vault') }],
  },
];

export default routes;
