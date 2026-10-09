import { Provider } from '@angular/core';

import { provideCommitments } from '~/modules/commitments/infra/commitments.providers';
import { provideDashboard } from '~/modules/dashboard/infra/dashboard.providers';
import { provideDebtOverview } from '~/modules/debt-overview/infra/debt-overview.providers';
import { provideDebts } from '~/modules/debts/infra/debts.providers';
import { provideExports } from '~/modules/exports/infra/exports.providers';
import { provideGoals } from '~/modules/goals/infra/goals.providers';
import { provideImports } from '~/modules/imports/infra/imports.providers';
import { provideMonthlySummary } from '~/modules/monthly-summary/infra/monthly-summary.providers';
import { provideNotes } from '~/modules/notes/infra/notes.providers';
import { providePeople } from '~/modules/people/infra/people.providers';
import { provideProjections } from '~/modules/projections/infra/projections.providers';
import { provideRecurrences } from '~/modules/recurrences/infra/recurrences.providers';
import { provideReports } from '~/modules/reports/infra/reports.providers';
import { provideThirdParties } from '~/modules/third-parties/infra/third-parties.providers';

/**
 * Portas (core) → implementações (infra) usadas por uma única área, ligadas na rota lazy dela
 * (orçamento do bundle inicial, T177). Como `app.config.ts`, é bootstrap autorizado a importar a
 * infra (S-31). O que o shell ou várias áreas usam continua em `app.config.ts`.
 * Se uma facade nova passar a usar uma porta daqui fora das rotas listadas, adicione a rota.
 */
export const IMPORT_PROVIDERS: Provider[] = [provideImports()];
/** Configurações: exportação e a seção do cofre (`VaultSectionComponent`, que usa `VaultGateway`). */
export const SETTINGS_PROVIDERS: Provider[] = [provideExports(), provideNotes()];
export const PLANNING_PROVIDERS: Provider[] = [
  provideRecurrences(),
  // Panorama (o que o Início tinha em "Compromissos e patrimônio") e o gasto por categoria do Resumo do mês.
  provideDashboard(),
  provideReports(),
  provideNotes(), // notas ligadas ao resumo do mês e aos compromissos (`LinkedNotes` lê `NotesGateway`)
  provideProjections(),
  provideMonthlySummary(),
  provideDebtOverview(),
  provideThirdParties(),
  provideCommitments(),
  providePeople(),
];
/** Detalhe da movimentação: marcar como despesa de terceiro (pessoas + terceiros). */
export const TRANSACTIONS_PROVIDERS: Provider[] = [
  provideThirdParties(),
  providePeople(),
  provideNotes(),
];
/** Relatórios: só o Início os lê; o UI Kit (dev/mock) usa a porta de demonstração do mesmo provider. */
export const REPORTS_PROVIDERS: Provider[] = [provideReports()];
export const HOME_PROVIDERS: Provider[] = [
  provideDashboard(),
  ...REPORTS_PROVIDERS,
  provideDebtOverview(),
  provideMonthlySummary(),
  provideGoals(),
  providePeople(),
  provideThirdParties(),
];
/** Detalhe do cartão e fatura: dívidas totais e as notas ligadas (`LinkedNotes` lê `NotesGateway`). */
export const CARD_DETAIL_PROVIDERS: Provider[] = [provideDebtOverview(), provideNotes()];
export const GOALS_PROVIDERS: Provider[] = [provideGoals(), provideNotes()];
export const NOTES_PROVIDERS: Provider[] = [
  provideNotes(),
  provideGoals(),
  provideDebts(),
  providePeople(),
];
export const DEBTS_PROVIDERS: Provider[] = [provideDebts(), provideNotes()];
export const PEOPLE_PROVIDERS: Provider[] = [providePeople(), provideNotes()];
export const QUICK_ADD_PROVIDERS: Provider[] = [provideDebts(), providePeople()];
export const VAULT_PROVIDERS: Provider[] = [provideNotes()];
