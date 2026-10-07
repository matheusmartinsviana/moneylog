import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from '~/app/app.routes';
import { provideI18n } from '~/app/common/i18n/i18n.providers';
import { authInterceptor } from '~/app/common/interceptors/auth.interceptor';
import { unauthorizedInterceptor } from '~/app/common/interceptors/unauthorized.interceptor';
import { I18nTitleStrategy } from '~/app/common/services/i18n-title.strategy';
import { provideTheme } from '~/app/common/services/theme.providers';
import { provideDemoMode } from '~/app/config/demo-mode';
import { environment } from '~/app/config/environment';
import { provideSessionEndHooks } from '~/app/session-end-hooks';
import { provideAccounts } from '~/modules/accounts/infra/accounts.providers';
import { provideAi } from '~/modules/ai/infra/ai.providers';
import { SessionFacade } from '~/modules/auth/core/facades/session.facade';
import { provideAuth } from '~/modules/auth/infra/auth.providers';
import { provideCards } from '~/modules/cards/infra/cards.providers';
import { provideCategories } from '~/modules/categories/infra/categories.providers';
import { provideDashboard } from '~/modules/dashboard/infra/dashboard.providers';
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
import { provideReports } from '~/modules/reports/infra/reports.providers';
import { provideSearch } from '~/modules/search/infra/search.providers';
import { provideTransactions } from '~/modules/transactions/infra/transactions.providers';
import { API_MOCKS } from '~/util/api-mocks';

/**
 * Bootstrap: providers globais. É também o único arquivo de `src/app` autorizado a ligar
 * portas do core às implementações da infra (S-31, exceção no .dependency-cruiser.cjs).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    { provide: TitleStrategy, useExisting: I18nTitleStrategy },
    provideI18n(),
    provideTheme(),
    // Ordem importa: o tratamento de 401 envolve o Bearer, para a repetição levar o token novo (T33).
    provideHttpClient(withFetch(), withInterceptors([unauthorizedInterceptor, authInterceptor])),
    // Modo demonstração: vazio no real e no mock; o build `demo` troca por um backend de exemplo.
    provideDemoMode(),
    { provide: API_MOCKS, useValue: environment.apiMocks },
    // S-31: única ligação porta (core) → implementação (infra), aqui no bootstrap.
    provideAuth(),
    provideAccounts(),
    provideCards(),
    provideCategories(),
    provideTransactions(),
    provideDashboard(),
    providePeople(),
    provideDebts(),
    provideRecurrences(),
    provideGoals(),
    provideMonthlySummary(),
    provideProjections(),
    provideExports(),
    provideImports(),
    provideNotifications(),
    provideSessionEndHooks(),
    provideAi(),
    provideNotes(),
    provideReports(),
    provideSearch(),
    // Restaura a sessão pelo cookie de refresh antes de ativar as rotas (T33 CA5). Nunca lança.
    provideAppInitializer(() => inject(SessionFacade).restore()),
    provideServiceWorker('sw-push.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
