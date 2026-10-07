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
      // Criar abre em modal sobre a lista; editar, sobre o detalhe da pessoa.
      {
        path: '',
        component: PeoplePage,
        title: pageTitle('people'),
        children: [{ path: 'new', component: PersonFormPage }],
      },
      {
        path: ':id',
        component: PersonPage,
        title: pageTitle('people'),
        children: [{ path: 'edit', component: PersonFormPage }],
      },
    ],
  },
];

export default routes;
