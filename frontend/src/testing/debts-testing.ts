import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';

import { DebtsGateway, DebtsQuery } from '~/modules/debts/core/interfaces/debts.gateway';
import type { Debt, DebtInput, DebtUpdate } from '~/modules/debts/core/types/debt';
import { brl } from '~/testing/accounts-testing';
import type { Slice } from '~/util/api/slice';

/** O cenário padrão do plano: empréstimo de 300,00 ao João, 100,00 já devolvidos. */
export function aDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: 'debt-1',
    person: { id: 'person-1', name: 'João' },
    creditorName: null,
    direction: 'RECEIVABLE',
    origin: 'WITH_MOVEMENT',
    originTransactionId: 'tx-loan',
    principal: brl('300.00'),
    settled: brl('100.00'),
    outstanding: brl('200.00'),
    status: 'PARTIALLY_SETTLED',
    date: '2026-10-05',
    expectedDate: '2026-10-20',
    overdue: false,
    description: 'Empréstimo',
    category: null,
    closureDate: null,
    closureReason: null,
    settlements: [
      { transactionId: 'tx-pay-1', amount: brl('100.00'), date: '2026-10-06', active: true },
    ],
    cancelable: true,
    voidable: false,
    voidBlockedBy: 'HAS_ORIGIN_TRANSACTION',
    version: 2,
    ...overrides,
  };
}

/** Porta falsa de dívidas: guarda as chamadas e devolve o que o teste configurar. */
export class DebtsGatewayStub extends DebtsGateway {
  debts: Debt[] = [];
  readonly queries: DebtsQuery[] = [];
  readonly calls: string[] = [];
  readonly creates: DebtInput[] = [];
  /** `Idempotency-Key` de cada `create`, na ordem. */
  readonly createKeys: string[] = [];
  readonly updates: DebtUpdate[] = [];
  readonly reasons: string[] = [];
  /** Resultado das escritas (`create`, `update`, `cancel`, `void`). */
  next: Observable<Debt> | null = null;
  getResult: Observable<Debt> | null = null;
  listError: Observable<never> | null = null;

  list(query: DebtsQuery): Observable<Slice<Debt>> {
    this.queries.push(query);
    if (this.listError) return this.listError;
    const filtered = this.debts.filter(
      (d) =>
        (!query.direction || d.direction === query.direction) &&
        (!query.status || d.status === query.status) &&
        (!query.personId || d.person?.id === query.personId),
    );
    const start = (query.page - 1) * query.pageSize;
    const items = filtered.slice(start, start + query.pageSize);
    return of({ items, hasNext: start + query.pageSize < filtered.length });
  }

  get(id: string): Observable<Debt> {
    this.calls.push(`get:${id}`);
    return this.getResult ?? of(this.debts.find((d) => d.id === id) ?? aDebt({ id }));
  }

  create(input: DebtInput, idempotencyKey: string): Observable<Debt> {
    this.createKeys.push(idempotencyKey);
    this.calls.push(`create:${input.description}`);
    this.creates.push(input);
    return (
      this.next ??
      of(
        aDebt({
          id: 'debt-new',
          origin: 'WITHOUT_MOVEMENT',
          originTransactionId: null,
          direction: input.direction,
          principal: brl(input.principal),
          settled: brl('0.00'),
          outstanding: brl(input.principal),
          status: 'OPEN',
          settlements: [],
        }),
      )
    );
  }

  update(id: string, input: DebtUpdate): Observable<Debt> {
    this.calls.push(`update:${id}:${input.version}`);
    this.updates.push(input);
    return (
      this.next ?? of(aDebt({ id, description: input.description, version: input.version + 1 }))
    );
  }

  cancel(id: string, reason: string): Observable<Debt> {
    this.calls.push(`cancel:${id}`);
    this.reasons.push(reason);
    return (
      this.next ??
      of(
        aDebt({
          id,
          status: 'CANCELED',
          outstanding: brl('0.00'),
          cancelable: false,
          closureReason: reason,
        }),
      )
    );
  }

  void(id: string, reason: string): Observable<Debt> {
    this.calls.push(`void:${id}`);
    this.reasons.push(reason);
    return (
      this.next ?? of(aDebt({ id, status: 'VOIDED', outstanding: brl('0.00'), cancelable: false }))
    );
  }
}

export function provideDebtsStub(stub: DebtsGatewayStub = new DebtsGatewayStub()): Provider[] {
  return [{ provide: DebtsGateway, useValue: stub }];
}
