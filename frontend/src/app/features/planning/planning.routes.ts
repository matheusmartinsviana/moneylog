import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { DebtsOverviewPage } from '~/app/features/planning/pages/debts-overview.page';
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
      // Criar e editar abrem em modal sobre a lista (`RecurrencesPage` tem o `<router-outlet>`).
      {
        path: 'recurrences',
        component: RecurrencesPage,
        title: pageTitle('planning'),
        children: [
          { path: 'new', component: RecurrenceFormPage },
          { path: ':id/edit', component: RecurrenceFormPage },
        ],
      },
      { path: 'occurrences', component: OccurrencesPage, title: pageTitle('planning') },
      { path: 'summary', component: SummaryPage, title: pageTitle('planning') },
      { path: 'summary/:month', component: SummaryPage, title: pageTitle('planning') },
      { path: 'projections', component: ProjectionsPage, title: pageTitle('planning') },
      { path: 'debts', component: DebtsOverviewPage, title: pageTitle('planning') },
    ],
  },
];

export default routes;
