import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';

import { DebtOverviewGateway } from '~/modules/debt-overview/core/interfaces/debt-overview.gateway';
import type {
  DebtOverview,
  OngoingInstallmentsInput,
  OngoingPreview,
} from '~/modules/debt-overview/core/types/debt-overview';
import { brl } from '~/testing/accounts-testing';

/** O cenário do plano: 6.500,00 (cartão 5.000,00 com 1 compra em andamento, pessoas 500,00, outros 1.000,00). */
export function aDebtOverview(overrides: Partial<DebtOverview> = {}): DebtOverview {
  return {
    asOf: '2026-10-07',
    total: brl('6500.00'),
    parts: { cards: brl('5000.00'), people: brl('500.00'), other: brl('1000.00') },
    cards: {
      total: brl('5000.00'),
      invoiced: brl('1000.00'),
      future: brl('4000.00'),
      items: [
        {
          card: { id: 'card-1', name: 'Nubank' },
          total: brl('5000.00'),
          invoiced: brl('1000.00'),
          future: brl('4000.00'),
          otherCharges: brl('3800.00'),
          adjustment: brl('0.00'),
          plans: [
            {
              purchaseId: 'p-1',
              description: 'Notebook',
              ongoing: true,
              installmentAmount: brl('150.00'),
              totalInstallments: 10,
              remainingInstallments: 8,
              nextInstallmentNumber: 3,
              remaining: brl('1200.00'),
              nextDueDate: '2026-11-10',
              lastDueDate: '2027-06-10',
            },
          ],
        },
      ],
    },
    people: {
      total: brl('500.00'),
      items: [
        {
          debtId: 'd-1',
          person: { id: 'person-1', name: 'João' },
          creditorName: 'João',
          description: 'Aluguel adiantado',
          outstanding: brl('500.00'),
          expectedDate: '2026-12-05',
          overdue: false,
        },
      ],
    },
    other: {
      total: brl('1000.00'),
      items: [
        {
          debtId: 'd-2',
          person: null,
          creditorName: 'Banco Azul',
          description: 'Financiamento',
          outstanding: brl('1000.00'),
          expectedDate: null,
          overdue: false,
        },
      ],
    },
    receivablesInfo: brl('300.00'),
    hasRecords: true,
    fixedCosts: { monthly: brl('3000.00'), estimate: true },
    income: { monthly: brl('6000.00'), source: 'RECURRING_ESTIMATE' },
    liquidity: { inAccounts: brl('2000.00'), available: brl('1800.00') },
    comparison: {
      debtToIncome: '1.0833',
      fixedCostToIncome: '0.5000',
      debtMinusInAccounts: brl('4500.00'),
      reason: null,
    },
    schedule: {
      months: 12,
      points: [
        {
          competence: '2026-11',
          cards: brl('150.00'),
          people: brl('0.00'),
          other: brl('0.00'),
          total: brl('150.00'),
          remainingAfter: brl('6350.00'),
        },
        {
          competence: '2026-12',
          cards: brl('150.00'),
          people: brl('500.00'),
          other: brl('0.00'),
          total: brl('650.00'),
          remainingAfter: brl('5700.00'),
        },
      ],
      overdue: brl('0.00'),
      undated: brl('1000.00'),
      beyondHorizon: brl('0.00'),
      payoffCompetence: null,
      payoffReason: 'UNDATED_DEBTS',
    },
    payoffGoal: null,
    ...overrides,
  };
}

export function anEmptyDebtOverview(): DebtOverview {
  const zero = brl('0.00');
  return aDebtOverview({
    total: zero,
    parts: { cards: zero, people: zero, other: zero },
    cards: { total: zero, invoiced: zero, future: zero, items: [] },
    people: { total: zero, items: [] },
    other: { total: zero, items: [] },
    receivablesInfo: zero,
    hasRecords: false,
    income: { monthly: null, source: 'NONE' },
    comparison: {
      debtToIncome: null,
      fixedCostToIncome: null,
      debtMinusInAccounts: zero,
      reason: 'NO_INCOME',
    },
    schedule: {
      months: 12,
      points: [],
      overdue: zero,
      undated: zero,
      beyondHorizon: zero,
      payoffCompetence: null,
      payoffReason: null,
    },
  });
}

export function anOngoingPreview(overrides: Partial<OngoingPreview> = {}): OngoingPreview {
  return {
    remainingInstallments: 8,
    installmentAmount: brl('150.00'),
    remaining: brl('1200.00'),
    firstDueDate: '2026-11-10',
    lastDueDate: '2027-06-10',
    ...overrides,
  };
}

/** Porta falsa: guarda as chamadas e devolve o que o teste configurar. */
export class DebtOverviewGatewayStub extends DebtOverviewGateway {
  overview$: Observable<DebtOverview> | null = null;
  previewResult: Observable<OngoingPreview> | null = null;
  createResult: Observable<string> | null = null;
  readonly gets: number[] = [];
  readonly previews: { cardId: string; input: OngoingInstallmentsInput }[] = [];
  readonly creates: { cardId: string; input: OngoingInstallmentsInput }[] = [];

  get(months: number): Observable<DebtOverview> {
    this.gets.push(months);
    return this.overview$ ?? of(aDebtOverview());
  }

  previewOngoing(cardId: string, input: OngoingInstallmentsInput): Observable<OngoingPreview> {
    this.previews.push({ cardId, input });
    return this.previewResult ?? of(anOngoingPreview());
  }

  createOngoing(cardId: string, input: OngoingInstallmentsInput): Observable<string> {
    this.creates.push({ cardId, input });
    return this.createResult ?? of('tx-ongoing-1');
  }
}

export function provideDebtOverviewStub(
  stub: DebtOverviewGatewayStub = new DebtOverviewGatewayStub(),
): Provider[] {
  return [{ provide: DebtOverviewGateway, useValue: stub }];
}
