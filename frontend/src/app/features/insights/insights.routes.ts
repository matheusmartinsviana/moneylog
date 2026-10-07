import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { InsightsPage } from '~/app/features/insights/pages/insights.page';

const routes: Routes = [{ path: '', component: InsightsPage, title: pageTitle('insights') }];

export default routes;
