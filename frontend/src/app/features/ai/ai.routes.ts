import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { AiPage } from '~/app/features/ai/pages/ai.page';

const routes: Routes = [{ path: '', component: AiPage, title: pageTitle('ai') }];

export default routes;
