import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { GoalFormPage } from '~/app/features/goals/pages/goal-form.page';
import { GoalPage } from '~/app/features/goals/pages/goal.page';
import { GoalsPage } from '~/app/features/goals/pages/goals.page';
import { GOALS_PROVIDERS } from '~/app/lazy-providers';

const routes: Routes = [
  {
    path: '',
    providers: GOALS_PROVIDERS,
    children: [
      // Criar abre em modal sobre a lista; editar, sobre o detalhe da meta.
      {
        path: '',
        component: GoalsPage,
        title: pageTitle('goals'),
        children: [{ path: 'new', component: GoalFormPage }],
      },
      {
        path: ':id',
        component: GoalPage,
        title: pageTitle('goals'),
        children: [{ path: 'edit', component: GoalFormPage }],
      },
    ],
  },
];

export default routes;
