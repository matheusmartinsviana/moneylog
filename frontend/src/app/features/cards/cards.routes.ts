import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { CardFormPage } from '~/app/features/cards/pages/card-form.page';
import { CardPage } from '~/app/features/cards/pages/card.page';
import { CardsPage } from '~/app/features/cards/pages/cards.page';
import { InvoicePage } from '~/app/features/cards/pages/invoice.page';

const routes: Routes = [
  { path: '', component: CardsPage, title: pageTitle('cards') },
  { path: 'new', component: CardFormPage, title: pageTitle('cards') },
  { path: ':id/edit', component: CardFormPage, title: pageTitle('cards') },
  { path: ':id', component: CardPage, title: pageTitle('cards') },
  { path: ':id/invoices/:invoiceId', component: InvoicePage, title: pageTitle('cards') },
];

export default routes;
