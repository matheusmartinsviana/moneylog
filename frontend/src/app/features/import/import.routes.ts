import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { ImportReviewPage } from '~/app/features/import/pages/import-review.page';
import { ImportPage } from '~/app/features/import/pages/import.page';

const routes: Routes = [
  { path: '', component: ImportPage, title: pageTitle('import') },
  { path: ':id', component: ImportReviewPage, title: pageTitle('import') },
];

export default routes;
