import { Routes } from '@angular/router';

import { pageTitle } from '~/app/common/services/i18n-title.strategy';
import { TransactionDetailPage } from '~/app/features/transactions/pages/transaction-detail.page';
import { TransactionEditPage } from '~/app/features/transactions/pages/transaction-edit.page';
import { TransactionsPage } from '~/app/features/transactions/pages/transactions.page';

const routes: Routes = [
  { path: ':id/edit', component: TransactionEditPage, title: pageTitle('transactions') },
  {
    path: '',
    component: TransactionsPage,
    title: pageTitle('transactions'),
    // Detalhe: painel lateral sobre a lista no desktop, página no celular.
    children: [{ path: ':id', component: TransactionDetailPage }],
  },
];

export default routes;
