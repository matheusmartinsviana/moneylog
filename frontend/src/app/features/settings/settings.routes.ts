import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { CategoriesPage } from '~/app/features/settings/pages/categories.page';
import { NotificationSettingsPage } from '~/app/features/settings/pages/notification-settings.page';
import { SettingsPage } from '~/app/features/settings/pages/settings.page';

const routes: Routes = [
  { path: '', component: SettingsPage, title: pageTitle('settings') },
  { path: 'notifications', component: NotificationSettingsPage, title: pageTitle('notifications') },
  { path: 'categories', component: CategoriesPage, title: pageTitle('settings') },
];

export default routes;
