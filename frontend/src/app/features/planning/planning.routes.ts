import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { CommitmentFormPage } from '~/app/features/planning/pages/commitment-form.page';
import { CommitmentPage } from '~/app/features/planning/pages/commitment.page';
import { CommitmentsPage } from '~/app/features/planning/pages/commitments.page';
import { DebtsOverviewPage } from '~/app/features/planning/pages/debts-overview.page';
import { OccurrencesPage } from '~/app/features/planning/pages/occurrences.page';
import { OverviewPage } from '~/app/features/planning/pages/overview.page';
import { ProjectionsPage } from '~/app/features/planning/pages/projections.page';
import { RecurrenceFormPage } from '~/app/features/planning/pages/recurrence-form.page';
import { RecurrencesPage } from '~/app/features/planning/pages/recurrences.page';
import { SummaryPage } from '~/app/features/planning/pages/summary.page';
import { ThirdPartiesPage } from '~/app/features/planning/pages/third-parties.page';
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
      { path: 'overview', component: OverviewPage, title: pageTitle('planning') },
      { path: 'summary', component: SummaryPage, title: pageTitle('planning') },
      { path: 'summary/:month', component: SummaryPage, title: pageTitle('planning') },
      { path: 'projections', component: ProjectionsPage, title: pageTitle('planning') },
      { path: 'debts', component: DebtsOverviewPage, title: pageTitle('planning') },
      { path: 'third-parties', component: ThirdPartiesPage, title: pageTitle('planning') },
      // Cadastrar abre em modal sobre a lista; o detalhe é uma página.
      {
        path: 'commitments',
        component: CommitmentsPage,
        title: pageTitle('planning'),
        children: [{ path: 'new', component: CommitmentFormPage }],
      },
      { path: 'commitments/:id', component: CommitmentPage, title: pageTitle('planning') },
    ],
  },
];

export default routes;
