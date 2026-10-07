import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { LoginPage } from '~/app/features/login/pages/login.page';

const routes: Routes = [{ path: '', component: LoginPage, title: pageTitle('login') }];

export default routes;
