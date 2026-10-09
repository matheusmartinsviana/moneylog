import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';

import {
  EntrySlice,
  TransactionSlice,
  TransactionsGateway,
} from '~/modules/transactions/core/interfaces/transactions.gateway';
import type { Entry } from '~/modules/transactions/core/types/entry';
import type { ListFilters } from '~/modules/transactions/core/types/list-filters';
import type { Transaction, TransactionTotals } from '~/modules/transactions/core/types/transaction';
import type { TransactionInput } from '~/modules/transactions/core/types/transaction-input';
import { brl } from '~/testing/accounts-testing';

export function aTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    type: 'EXPENSE',
    status: 'ACTIVE',
    amount: brl('35.00'),
    date: '2026-10-04',
    description: 'Almoço',
    notes: null,
    category: { id: 'cat-1', name: 'Alimentação' },
    card: null,
    account: { id: 'acc-1', name: 'Nubank' },
    counterpartAccount: null,
    method: 'PIX',
    direction: null,
    adjustmentKind: null,
    reason: null,
    refundOf: null,
    installments: [],
    invoice: null,
    debt: null,
    shares: [],
    recurrenceId: null,
    occurrenceDate: null,
    incomeCompetence: null,
    impact: {
      cash: brl('-35.00'),
      consumption: [{ competence: '2026-10', amount: brl('35.00') }],
      netWorth: brl('-35.00'),
      commitment: brl('0.00'),
    },
    editable: true,
    voidable: true,
    voidBlockedBy: null,
    voidReason: null,
    voidedAt: null,
    source: 'MANUAL',
    version: 1,
    formValue: null,
    ...overrides,
  };
}

export function someTotals(count = 3): TransactionTotals {
  return { count, cashFlow: { in: brl('100.00'), out: brl('40.00'), net: brl('60.00') } };
}

export function anEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    transactionId: 'tx-1',
    transactionType: 'EXPENSE',
    date: '2026-10-04',
    competence: '2026-10',
    description: 'Almoço',
    category: { id: 'cat-1', name: 'Alimentação' },
    installment: null,
    via: 'ACCOUNT',
    method: 'PIX',
    cardId: null,
    accountId: 'acc-1',
    amount: brl('35.00'),
    ...overrides,
  };
}

/** Porta falsa de movimentações: registra as chamadas e devolve o que o teste configurar. */
export class TransactionsGatewayStub extends TransactionsGateway {
  readonly listCalls: { filters: ListFilters; page: number; pageSize: number }[] = [];
  readonly entryCalls: { filters: ListFilters; page: number; pageSize: number }[] = [];
  readonly creates: { input: TransactionInput; key: string }[] = [];
  readonly updates: { id: string; input: TransactionInput; version: number }[] = [];
  readonly voids: { id: string; reason: string }[] = [];
  readonly cancels: { id: string; reason: string }[] = [];
  list$: (page: number) => Observable<TransactionSlice> = () =>
    of({ items: [aTransaction()], hasNext: false, totals: someTotals(1) });
  entries$: (page: number) => Observable<EntrySlice> = () =>
    of({
      items: [anEntry()],
      hasNext: false,
      debtItems: [],
      totals: { total: brl('35.00'), byCategory: [] },
    });
  get$: Observable<Transaction> = of(aTransaction());
  create$: Observable<Transaction> = of(aTransaction());
  update$: Observable<Transaction> = of(aTransaction());
  void$: Observable<Transaction> = of(aTransaction({ status: 'VOIDED' }));
  cancel$: Observable<Transaction> = of(aTransaction());

  list(filters: ListFilters, page: number, pageSize: number): Observable<TransactionSlice> {
    this.listCalls.push({ filters, page, pageSize });
    return this.list$(page);
  }

  listEntries(filters: ListFilters, page: number, pageSize: number): Observable<EntrySlice> {
    this.entryCalls.push({ filters, page, pageSize });
    return this.entries$(page);
  }

  get(): Observable<Transaction> {
    return this.get$;
  }

  create(input: TransactionInput, key: string): Observable<Transaction> {
    this.creates.push({ input, key });
    return this.create$;
  }

  update(id: string, input: TransactionInput, version: number): Observable<Transaction> {
    this.updates.push({ id, input, version });
    return this.update$;
  }

  void(id: string, reason: string): Observable<Transaction> {
    this.voids.push({ id, reason });
    return this.void$;
  }

  cancelInstallments(id: string, reason: string): Observable<Transaction> {
    this.cancels.push({ id, reason });
    return this.cancel$;
  }
}

export function provideTransactionsStub(
  stub: TransactionsGatewayStub = new TransactionsGatewayStub(),
): Provider[] {
  return [{ provide: TransactionsGateway, useValue: stub }];
}

export const anExpenseInput = (overrides: Partial<TransactionInput> = {}): TransactionInput =>
  ({
    type: 'EXPENSE',
    amount: '35.00',
    date: '2026-10-04',
    description: 'Almoço',
    notes: null,
    accountId: 'acc-1',
    categoryId: 'cat-1',
    method: 'PIX',
    ...overrides,
  }) as TransactionInput;
