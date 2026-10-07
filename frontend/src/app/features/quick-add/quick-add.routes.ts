import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { QuickAddPage } from '~/app/features/quick-add/pages/quick-add.page';

const routes: Routes = [{ path: '', component: QuickAddPage, title: pageTitle('quickAdd') }];

export default routes;
