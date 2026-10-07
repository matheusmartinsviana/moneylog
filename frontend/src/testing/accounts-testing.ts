import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';

import {
  AccountsGateway,
  AccountsQuery,
} from '~/modules/accounts/core/interfaces/accounts.gateway';
import type { Account } from '~/modules/accounts/core/types/account';
import type { AccountInput, AccountUpdate } from '~/modules/accounts/core/types/account-input';
import { Problem, ProblemError } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';

export const brl = (amount: string) => ({ amount, currency: 'BRL' });

export function anAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    name: 'Nubank',
    type: 'CHECKING',
    liquidity: 'CASH',
    institution: 'Nubank',
    openingBalance: brl('1000.00'),
    openingDate: '2026-01-01',
    currentBalance: brl('1234.56'),
    status: 'ACTIVE',
    openingEditable: false,
    archivable: false,
    reservedAmount: brl('0.00'),
    uncovered: false,
    version: 3,
    ...overrides,
  };
}

export function aProblem(
  status: number,
  code: string,
  fieldErrors: Problem['fieldErrors'] = [],
): Problem {
  return { status, code, fieldErrors, traceId: 't-1', retryAfterSeconds: null };
}

export const failWith = (status: number, code: string, fieldErrors: Problem['fieldErrors'] = []) =>
  throwError(() => new ProblemError(aProblem(status, code, fieldErrors)));

/** Porta falsa de contas: guarda as chamadas e devolve o que o teste configurar. */
export class AccountsGatewayStub extends AccountsGateway {
  accounts: Account[] = [];
  readonly queries: AccountsQuery[] = [];
  readonly calls: string[] = [];
  readonly created: AccountInput[] = [];
  next: Observable<Account> | null = null;
  /** Resultado do `get` (separado de `next`, que vale para as escritas). */
  getResult: Observable<Account> | null = null;
  listError: Observable<never> | null = null;

  list(query: AccountsQuery): Observable<Slice<Account>> {
    this.queries.push(query);
    if (this.listError) return this.listError;
    const filtered = this.accounts.filter((a) => !query.status || a.status === query.status);
    const start = (query.page - 1) * query.pageSize;
    const items = filtered.slice(start, start + query.pageSize);
    return of({ items, hasNext: start + query.pageSize < filtered.length });
  }

  get(id: string): Observable<Account> {
    this.calls.push(`get:${id}`);
    return this.getResult ?? of(this.accounts.find((a) => a.id === id) ?? anAccount({ id }));
  }

  create(input: AccountInput): Observable<Account> {
    this.calls.push(`create:${input.name}`);
    this.created.push(input);
    return this.next ?? of(anAccount({ name: input.name, type: input.type }));
  }

  update(id: string, input: AccountUpdate): Observable<Account> {
    this.calls.push(`update:${id}:${input.version}`);
    return this.next ?? of(anAccount({ id, name: input.name, version: input.version + 1 }));
  }

  archive(id: string): Observable<Account> {
    this.calls.push(`archive:${id}`);
    return this.next ?? of(anAccount({ id, status: 'ARCHIVED', archivable: false }));
  }

  unarchive(id: string): Observable<Account> {
    this.calls.push(`unarchive:${id}`);
    return this.next ?? of(anAccount({ id, status: 'ACTIVE' }));
  }
}

export function provideAccountsStub(
  stub: AccountsGatewayStub = new AccountsGatewayStub(),
): Provider[] {
  return [{ provide: AccountsGateway, useValue: stub }];
}
