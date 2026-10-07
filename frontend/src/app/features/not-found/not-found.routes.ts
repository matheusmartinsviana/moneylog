import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { NotFoundPage } from '~/app/features/not-found/pages/not-found.page';

const routes: Routes = [{ path: '', component: NotFoundPage, title: pageTitle('notFound') }];

export default routes;
