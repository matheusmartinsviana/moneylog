import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { VaultPage } from '~/app/features/vault/pages/vault.page';

const routes: Routes = [{ path: '', component: VaultPage, title: pageTitle('vault') }];

export default routes;
