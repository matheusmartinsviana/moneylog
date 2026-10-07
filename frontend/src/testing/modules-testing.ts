import { Provider } from '@angular/core';

import { provideAccounts } from '~/modules/accounts/infra/accounts.providers';
import { provideAi } from '~/modules/ai/infra/ai.providers';
import { provideCards } from '~/modules/cards/infra/cards.providers';
import { provideCategories } from '~/modules/categories/infra/categories.providers';
import { provideDebts } from '~/modules/debts/infra/debts.providers';
import { provideExports } from '~/modules/exports/infra/exports.providers';
import { provideGoals } from '~/modules/goals/infra/goals.providers';
import { provideImports } from '~/modules/imports/infra/imports.providers';
import { provideMonthlySummary } from '~/modules/monthly-summary/infra/monthly-summary.providers';
import { provideNotes } from '~/modules/notes/infra/notes.providers';
import { provideNotifications } from '~/modules/notifications/infra/notifications.providers';
import { providePeople } from '~/modules/people/infra/people.providers';
import { provideProjections } from '~/modules/projections/infra/projections.providers';
import { provideRecurrences } from '~/modules/recurrences/infra/recurrences.providers';
import { provideReports } from '~/modules/reports/infra/reports.providers.dev';
import { provideSearch } from '~/modules/search/infra/search.providers';
import { provideTransactions } from '~/modules/transactions/infra/transactions.providers';

/**
 * A mesma ligação do bootstrap (porta → infra) para os módulos de negócio, para testar o app
 * montado de ponta a ponta em modo mock (quem chama fornece `HttpClient` e `API_MOCKS = true`).
 */
export function provideBusinessModules(): Provider[] {
  return [
    ...provideAccounts(),
    ...provideAi(),
    ...provideCards(),
    ...provideCategories(),
    ...provideTransactions(),
    ...providePeople(),
    ...provideDebts(),
    ...provideRecurrences(),
    ...provideGoals(),
    ...provideMonthlySummary(),
    ...provideProjections(),
    ...provideExports(),
    ...provideImports(),
    ...provideNotifications(),
    ...provideNotes(),
    ...provideReports(),
    ...provideSearch(),
  ];
}
