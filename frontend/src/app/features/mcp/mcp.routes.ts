import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { McpPage } from '~/app/features/mcp/pages/mcp.page';

const routes: Routes = [{ path: '', component: McpPage, title: pageTitle('mcp') }];

export default routes;
