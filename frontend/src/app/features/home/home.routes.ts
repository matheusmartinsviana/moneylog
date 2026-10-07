import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { HomePage } from '~/app/features/home/pages/home.page';
import { HOME_PROVIDERS } from '~/app/lazy-providers';

const routes: Routes = [
  {
    path: '',
    providers: HOME_PROVIDERS,
    children: [{ path: '', component: HomePage, title: pageTitle('home') }],
  },
];

export default routes;
