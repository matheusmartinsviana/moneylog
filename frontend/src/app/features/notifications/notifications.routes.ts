import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { NotificationsPage } from '~/app/features/notifications/pages/notifications.page';

const routes: Routes = [
  { path: '', component: NotificationsPage, title: pageTitle('notifications') },
];

export default routes;
