import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { HomePage } from '~/app/features/home/pages/home.page';

const routes: Routes = [{ path: '', component: HomePage, title: pageTitle('home') }];

export default routes;
