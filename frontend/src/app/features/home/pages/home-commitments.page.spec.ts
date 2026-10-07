import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { HomePage } from '~/app/features/home/pages/home.page';
import type { Upcoming } from '~/modules/dashboard/core/types/upcoming';
import { brl, failWith, provideAccountsStub } from '~/testing/accounts-testing';
import { provideAiStub } from '~/testing/ai-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { CardsGatewayStub, provideCardsStub } from '~/testing/cards-testing';
import {
  aDashboardSummary,
  DashboardGatewayStub,
  provideDashboardStub,
} from '~/testing/dashboard-testing';
import { provideGoalsStub } from '~/testing/goals-testing';
import { provideHomeSupportStubs } from '~/testing/home-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  aRealized,
  provideRecurrencesStub,
  RecurrencesGatewayStub,
} from '~/testing/recurrences-testing';

vi.setConfig({ testTimeout: 20_000 });

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

const upcomingWithInternet = (): Upcoming => ({
  items: [
    {
      kind: 'DEBT_RECEIVABLE',
      bucket: 'NEXT_7_DAYS',
      dueDate: '2026-10-05',
      direction: 'IN',
      amount: brl('150.00'),
      label: 'João',
      refType: 'DEBT',
      refId: 'debt-1',
      items: [],
    },
    {
      kind: 'RECURRENCE',
      bucket: 'NEXT_7_DAYS',
      dueDate: '2026-10-10',
      direction: 'OUT',
      amount: brl('119.00'),
      label: 'Internet',
      refType: 'RECURRENCE',
      refId: 'rec-1',
      items: [],
    },
  ],
  undated: [],
  totals: { out: brl('119.00'), in: brl('150.00') },
  overdueTruncated: false,
});

async function setup(
  stub = new DashboardGatewayStub(),
  recurrences = new RecurrencesGatewayStub(),
) {
  const result = await render(HomePage, {
    providers: [
      provideI18nTesting('pt'),
      provideRouter([]),
      ...provideAiStub(),
      provideDashboardStub(stub),
      provideCardsStub(new CardsGatewayStub()),
      provideGoalsStub(),
      provideAccountsStub(),
      ...provideHomeSupportStubs(),
      provideRecurrencesStub(recurrences),
    ],
  });
  await result.fixture.whenStable();
  return { ...result, stub, recurrences };
}

describe('HomePage: dívidas e recorrências (T89)', () => {
  it('Dado o /upcoming com cobrança e recorrência, então os números do Início são os do backend (sem soma no front)', async () => {
    const stub = new DashboardGatewayStub();
    stub.upcoming$ = of(upcomingWithInternet());
    await setup(stub);

    expect(text(screen.getByTestId('home-upcoming-total-out'))).toBe('R$ 119,00');
    expect(text(screen.getByTestId('home-upcoming-total-in'))).toBe('R$ 150,00');
  });

  it('Dado consumo de dívida (S-137), então o mês mostra a linha "gastos pagos por outra pessoa", que já está no consumo', async () => {
    const stub = new DashboardGatewayStub();
    const base = aDashboardSummary();
    stub.summary$ = of({
      ...base,
      month: { ...base.month, debtConsumption: brl('80.00'), consumption: brl('1700.50') },
    });
    await setup(stub);

    expect(text(screen.getByTestId('home-month-debt-consumption'))).toBe('R$ 80,00');
    expect(text(screen.getByTestId('home-month-consumption'))).toBe('R$ 1.700,50');
  });

  it('Dado debtConsumption zero ou ausente, então a linha não aparece', async () => {
    await setup();

    expect(screen.queryByTestId('home-month-debt-consumption')).not.toBeInTheDocument();
  });

  it('Dado "Realizar" na internet, então abre a folha de T88 com o valor do modelo e, ao realizar, o Início recarrega do backend', async () => {
    let summaries = 0;
    const stub = new DashboardGatewayStub();
    stub.upcoming$ = of(upcomingWithInternet());
    const { defer } = await import('rxjs');
    stub.summary$ = defer(() => {
      summaries++;
      return of(aDashboardSummary());
    });
    const { recurrences, fixture } = await setup(stub);
    expect(summaries).toBe(1);

    await userEvent.click(screen.getByTestId('home-upcoming-realize'));
    expect(screen.getByTestId('realize-sheet-panel')).toHaveTextContent('Realizar Internet');
    expect((screen.getByTestId('realize-amount') as HTMLInputElement).value).toBe('119,00');
    await userEvent.clear(screen.getByTestId('realize-amount'));
    await userEvent.type(screen.getByTestId('realize-amount'), '124,90');
    recurrences.realize$ = of(aRealized());
    await userEvent.click(screen.getByTestId('realize-submit'));
    await fixture.whenStable();

    expect(recurrences.realizations[0]).toMatchObject({
      recurrenceId: 'rec-1',
      date: '2026-10-10',
      amount: '124.90',
    });
    expect(summaries).toBe(2);
    expect(screen.queryByTestId('realize-sheet-panel')).not.toBeInTheDocument();
  });

  it('Dado RECURRENCE_OCCURRENCE_ALREADY_REALIZED no Início, então avisa e recarrega', async () => {
    const stub = new DashboardGatewayStub();
    stub.upcoming$ = of(upcomingWithInternet());
    let summaries = 0;
    const { defer } = await import('rxjs');
    stub.summary$ = defer(() => {
      summaries++;
      return of(aDashboardSummary());
    });
    const recurrences = new RecurrencesGatewayStub();
    const { fixture } = await setup(stub, recurrences);
    await userEvent.click(screen.getByTestId('home-upcoming-realize'));
    recurrences.realize$ = failWith(422, 'RECURRENCE_OCCURRENCE_ALREADY_REALIZED');

    await userEvent.click(screen.getByTestId('realize-submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(screen.getByTestId('realize-error')).toHaveTextContent(
      pt.errors.codes['RECURRENCE_OCCURRENCE_ALREADY_REALIZED']!,
    );
    expect(summaries).toBe(2);
  });

  it('Dado que a ocorrência mudou em outro aparelho (RECURRENCE_ENDED), então o Início recarrega sem piscar o esqueleto e a folha continua montada', async () => {
    const stub = new DashboardGatewayStub();
    stub.upcoming$ = of(upcomingWithInternet());
    let summaries = 0;
    const { defer, NEVER } = await import('rxjs');
    stub.summary$ = defer(() => {
      summaries++;
      return summaries === 1 ? of(aDashboardSummary()) : NEVER;
    });
    const recurrences = new RecurrencesGatewayStub();
    const { fixture } = await setup(stub, recurrences);
    await userEvent.click(screen.getByTestId('home-upcoming-realize'));
    recurrences.realize$ = failWith(422, 'RECURRENCE_ENDED');

    await userEvent.click(screen.getByTestId('realize-submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    // A recarga está pendente (NEVER): o Início segue na tela, sem esqueleto, e a folha com o erro.
    expect(summaries).toBe(2);
    expect(screen.queryByTestId('home-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('realize-error')).toHaveTextContent(
      pt.errors.codes['RECURRENCE_ENDED']!,
    );
  });

  it('Dado falha de rede ao realizar, quando fecho e reabro depois de uma recarga em segundo plano, então a Idempotency-Key é a mesma', async () => {
    const stub = new DashboardGatewayStub();
    stub.upcoming$ = of(upcomingWithInternet());
    const recurrences = new RecurrencesGatewayStub();
    const { fixture } = await setup(stub, recurrences);
    await userEvent.click(screen.getByTestId('home-upcoming-realize'));
    recurrences.realize$ = failWith(0, 'NETWORK');
    await userEvent.click(screen.getByTestId('realize-submit'));
    await fixture.whenStable();
    // A recarga do Início (aqui via o botão de erro de outra seção) não pode destruir a folha.
    fixture.componentInstance['dashboard'].reload();
    await fixture.whenStable();
    fixture.detectChanges();
    await userEvent.click(screen.getByTestId('realize-submit'));
    await fixture.whenStable();

    const keys = recurrences.realizations.map((r) => r.key);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('Dado que a recarga em segundo plano falha, então o Início mantém os dados, avisa e "tentar de novo" recarrega', async () => {
    const stub = new DashboardGatewayStub();
    stub.upcoming$ = of(upcomingWithInternet());
    let summaries = 0;
    const { defer, throwError } = await import('rxjs');
    stub.summary$ = defer(() => {
      summaries++;
      return summaries === 2 ? throwError(() => new Error('rede')) : of(aDashboardSummary());
    });
    const { fixture } = await setup(stub);

    fixture.componentInstance['dashboard'].reload();
    fixture.detectChanges();

    expect(screen.getByTestId('home-dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state-action-retry')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-refresh-failed')).toHaveTextContent(pt.home.refreshFailed);

    await userEvent.click(screen.getByTestId('home-refresh-retry'));
    fixture.detectChanges();

    expect(summaries).toBe(3);
    expect(screen.queryByTestId('home-refresh-failed')).not.toBeInTheDocument();
  });

  it('Dado overdueTruncated no /upcoming, então avisa que mostra as 500 atrasadas mais recentes', async () => {
    const stub = new DashboardGatewayStub();
    stub.upcoming$ = of({ ...upcomingWithInternet(), overdueTruncated: true });
    await setup(stub);

    expect(screen.getByTestId('home-upcoming-truncated')).toHaveTextContent(
      pt.home.upcoming.overdueTruncated,
    );
    // Os totais continuam os do backend.
    expect(text(screen.getByTestId('home-upcoming-total-out'))).toBe('R$ 119,00');
  });

  it('Dado o Início com compromissos, então o axe não aponta violações', async () => {
    const stub = new DashboardGatewayStub();
    stub.upcoming$ = of(upcomingWithInternet());
    const { container } = await setup(stub);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  }, 60_000);
});
