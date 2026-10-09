import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { CardFormPage } from '~/app/features/cards/pages/card-form.page';
import { CardPage } from '~/app/features/cards/pages/card.page';
import { CardsPage } from '~/app/features/cards/pages/cards.page';
import { InvoicePage } from '~/app/features/cards/pages/invoice.page';
import { CARD_DETAIL_PROVIDERS } from '~/app/lazy-providers';

const routes: Routes = [
  // Criar abre em modal sobre a lista; editar, sobre o detalhe do cartão (ambos com `<router-outlet>`).
  {
    path: '',
    component: CardsPage,
    title: pageTitle('cards'),
    children: [{ path: 'new', component: CardFormPage }],
  },
  {
    path: ':id',
    providers: CARD_DETAIL_PROVIDERS,
    component: CardPage,
    title: pageTitle('cards'),
    children: [{ path: 'edit', component: CardFormPage }],
  },
  {
    path: ':id/invoices/:invoiceId',
    providers: CARD_DETAIL_PROVIDERS,
    component: InvoicePage,
    title: pageTitle('cards'),
  },
];

export default routes;
