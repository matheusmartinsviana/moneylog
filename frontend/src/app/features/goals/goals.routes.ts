import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { GoalFormPage } from '~/app/features/goals/pages/goal-form.page';
import { GoalPage } from '~/app/features/goals/pages/goal.page';
import { GoalsPage } from '~/app/features/goals/pages/goals.page';

const routes: Routes = [
  { path: '', component: GoalsPage, title: pageTitle('goals') },
  { path: 'new', component: GoalFormPage, title: pageTitle('goals') },
  { path: ':id/edit', component: GoalFormPage, title: pageTitle('goals') },
  { path: ':id', component: GoalPage, title: pageTitle('goals') },
];

export default routes;
