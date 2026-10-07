import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { QuickAddPage } from '~/app/features/quick-add/pages/quick-add.page';
import { QUICK_ADD_PROVIDERS } from '~/app/lazy-providers';

const routes: Routes = [
  {
    path: '',
    providers: QUICK_ADD_PROVIDERS,
    children: [{ path: '', component: QuickAddPage, title: pageTitle('quickAdd') }],
  },
];

export default routes;
