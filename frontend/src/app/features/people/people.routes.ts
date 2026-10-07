import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { PeoplePage } from '~/app/features/people/pages/people.page';
import { PersonFormPage } from '~/app/features/people/pages/person-form.page';
import { PersonPage } from '~/app/features/people/pages/person.page';
import { PEOPLE_PROVIDERS } from '~/app/lazy-providers';

const routes: Routes = [
  {
    path: '',
    providers: PEOPLE_PROVIDERS,
    children: [
      { path: '', component: PeoplePage, title: pageTitle('people') },
      { path: 'new', component: PersonFormPage, title: pageTitle('people') },
      { path: ':id/edit', component: PersonFormPage, title: pageTitle('people') },
      { path: ':id', component: PersonPage, title: pageTitle('people') },
    ],
  },
];

export default routes;
