import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { NotePage } from '~/app/features/notes/pages/note.page';
import { NotesPage } from '~/app/features/notes/pages/notes.page';
import { NOTES_PROVIDERS } from '~/app/lazy-providers';

const routes: Routes = [
  {
    path: '',
    providers: NOTES_PROVIDERS,
    children: [
      { path: '', component: NotesPage, title: pageTitle('notes') },
      {
        path: ':id',
        component: NotePage,
        title: pageTitle('notes'),
        // Alterações não salvas: o ConfirmDialog "Sair sem salvar?" da própria página decide.
        canDeactivate: [(page: NotePage) => page.confirmLeave()],
      },
    ],
  },
];

export default routes;
