import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';

import { ThirdPartiesGateway } from '~/modules/third-parties/core/interfaces/third-parties.gateway';
import type {
  ThirdPartyExpense,
  ThirdPartyExpenseInput,
  ThirdPartyReceivables,
} from '~/modules/third-parties/core/types/third-party';
import { brl } from '~/testing/accounts-testing';

/** Dados sintéticos: uma pessoa com uma despesa marcada (parcialmente reembolsada) e um empréstimo. */
export function aReceivables(
  overrides: Partial<ThirdPartyReceivables> = {},
): ThirdPartyReceivables {
  return {
    asOf: '2026-10-07',
    owed: brl('800.00'),
    received: brl('100.00'),
    pending: brl('700.00'),
    people: [
      {
        personId: 'person-1',
        name: 'Ana',
        owed: brl('800.00'),
        received: brl('100.00'),
        pending: brl('700.00'),
        items: [
          {
            source: 'EXPENSE',
            refId: 'tx-tp-1',
            description: 'Presente de aniversário',
            date: '2026-10-02',
            expectedDate: '2026-11-05',
            owed: brl('300.00'),
            received: brl('100.00'),
            pending: brl('200.00'),
            status: 'PARTIAL',
          },
          {
            source: 'DEBT',
            refId: 'debt-tp-1',
            description: 'Empréstimo',
            date: '2026-09-01',
            expectedDate: null,
            owed: brl('500.00'),
            received: brl('0.00'),
            pending: brl('500.00'),
            status: 'OPEN',
          },
        ],
      },
    ],
    month: {
      competence: '2026-10',
      grossConsumption: brl('3200.00'),
      refunds: brl('100.00'),
      personalNet: brl('3100.00'),
      thirdPartyConsumption: brl('300.00'),
      thirdPartyReimbursed: brl('100.00'),
      thirdPartyPending: brl('200.00'),
    },
    ...overrides,
  };
}

export function anEmptyReceivables(): ThirdPartyReceivables {
  const zero = brl('0.00');
  return aReceivables({
    owed: zero,
    received: zero,
    pending: zero,
    people: [],
    month: {
      competence: '2026-10',
      grossConsumption: zero,
      refunds: zero,
      personalNet: zero,
      thirdPartyConsumption: zero,
      thirdPartyReimbursed: zero,
      thirdPartyPending: zero,
    },
  });
}

/** Porta falsa: guarda as chamadas e devolve o que o teste configurar. */
export class ThirdPartiesGatewayStub extends ThirdPartiesGateway {
  receivables$: Observable<ThirdPartyReceivables> | null = null;
  mark$: Observable<ThirdPartyExpense> | null = null;
  readonly gets: (string | null)[] = [];
  readonly marks: { input: ThirdPartyExpenseInput; key: string }[] = [];

  receivables(month: string | null): Observable<ThirdPartyReceivables> {
    this.gets.push(month);
    return this.receivables$ ?? of(aReceivables());
  }

  mark(input: ThirdPartyExpenseInput, key: string): Observable<ThirdPartyExpense> {
    this.marks.push({ input, key });
    return (
      this.mark$ ??
      of({
        id: 'tpe-1',
        transactionId: input.transactionId,
        personId: input.personId,
        note: input.note,
      })
    );
  }
}

export function provideThirdPartiesStub(
  stub: ThirdPartiesGatewayStub = new ThirdPartiesGatewayStub(),
): Provider[] {
  return [{ provide: ThirdPartiesGateway, useValue: stub }];
}
