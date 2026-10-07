import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { MorePage } from '~/app/features/more/pages/more.page';

const routes: Routes = [{ path: '', component: MorePage, title: pageTitle('more') }];

export default routes;
