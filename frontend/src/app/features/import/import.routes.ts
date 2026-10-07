import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { ImportReviewPage } from '~/app/features/import/pages/import-review.page';
import { ImportPage } from '~/app/features/import/pages/import.page';
import { IMPORT_PROVIDERS } from '~/app/lazy-providers';

const routes: Routes = [
  {
    path: '',
    providers: IMPORT_PROVIDERS,
    children: [
      { path: '', component: ImportPage, title: pageTitle('import') },
      { path: ':id', component: ImportReviewPage, title: pageTitle('import') },
    ],
  },
];

export default routes;
