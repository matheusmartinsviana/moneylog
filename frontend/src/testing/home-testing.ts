import { Provider } from '@angular/core';

import { provideCategoriesStub } from '~/testing/categories-testing';
import { provideDebtOverviewStub } from '~/testing/debt-overview-testing';
import { provideMonthlySummaryStub } from '~/testing/etapa5-testing';
import { provideNotificationsStub } from '~/testing/notifications-testing';
import { providePeopleStub } from '~/testing/people-testing';
import { provideReportsStub } from '~/testing/reports-testing';
import { provideTransactionsStub } from '~/testing/transactions-testing';

/**
 * As portas que o Início redesenhado lê além do dashboard, das contas, dos cartões e das metas: o resumo mensal
 * (KPIs e insight), os relatórios (gráfico e categorias) e as movimentações (recentes e Quick Capture) e as categorias (Quick Capture). Padrão: dados do contrato.
 */
export function provideHomeSupportStubs(): Provider[] {
  return [
    ...provideMonthlySummaryStub(),
    ...provideReportsStub(),
    ...provideTransactionsStub(),
    ...provideCategoriesStub(),
    ...provideNotificationsStub(),
    ...providePeopleStub(),
    ...provideDebtOverviewStub(),
  ];
}
