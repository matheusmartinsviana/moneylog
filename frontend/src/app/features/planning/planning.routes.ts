import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { OccurrencesPage } from '~/app/features/planning/pages/occurrences.page';
import { ProjectionsPage } from '~/app/features/planning/pages/projections.page';
import { RecurrenceFormPage } from '~/app/features/planning/pages/recurrence-form.page';
import { RecurrencesPage } from '~/app/features/planning/pages/recurrences.page';
import { SummaryPage } from '~/app/features/planning/pages/summary.page';
import { PLANNING_PROVIDERS } from '~/app/lazy-providers';

const routes: Routes = [
  {
    path: '',
    providers: PLANNING_PROVIDERS,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'recurrences' },
      { path: 'recurrences', component: RecurrencesPage, title: pageTitle('planning') },
      { path: 'recurrences/new', component: RecurrenceFormPage, title: pageTitle('planning') },
      { path: 'recurrences/:id/edit', component: RecurrenceFormPage, title: pageTitle('planning') },
      { path: 'occurrences', component: OccurrencesPage, title: pageTitle('planning') },
      { path: 'summary', component: SummaryPage, title: pageTitle('planning') },
      { path: 'summary/:month', component: SummaryPage, title: pageTitle('planning') },
      { path: 'projections', component: ProjectionsPage, title: pageTitle('planning') },
    ],
  },
];

export default routes;
