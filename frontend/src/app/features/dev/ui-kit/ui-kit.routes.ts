import { Routes } from '@angular/router';

import { UiKitPage } from '~/app/features/dev/ui-kit/ui-kit.page';
import { REPORTS_PROVIDERS } from '~/app/lazy-providers';

// Os relatórios são ligados na rota lazy do Início; o UI Kit (só dev/mock) liga os mesmos aqui.
const routes: Routes = [{ path: '', providers: REPORTS_PROVIDERS, component: UiKitPage }];

export default routes;
