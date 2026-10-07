import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';

import { PeopleGateway, PeopleQuery } from '~/modules/people/core/interfaces/people.gateway';
import type {
  Person,
  PersonDetail,
  PersonInput,
  PersonUpdate,
} from '~/modules/people/core/types/person';
import { brl } from '~/testing/accounts-testing';
import type { Slice } from '~/util/api/slice';
import type { DebtSummary } from '~/util/debt';

export function aPerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'person-1',
    name: 'João',
    notes: null,
    archived: false,
    net: brl('150.00'),
    direction: 'RECEIVABLE',
    openDebts: 1,
    nextDueDate: '2026-10-20',
    version: 1,
    ...overrides,
  };
}

export function aDebtSummary(overrides: Partial<DebtSummary> = {}): DebtSummary {
  return {
    id: 'debt-1',
    person: { id: 'person-1', name: 'João' },
    direction: 'RECEIVABLE',
    status: 'OPEN',
    principal: brl('300.00'),
    settled: brl('0.00'),
    outstanding: brl('300.00'),
    date: '2026-10-05',
    expectedDate: '2026-10-20',
    overdue: false,
    description: 'Empréstimo',
    ...overrides,
  };
}

export function aPersonDetail(overrides: Partial<PersonDetail> = {}): PersonDetail {
  return { ...aPerson(), debts: [aDebtSummary()], ...overrides };
}

/** Porta falsa de pessoas: guarda as chamadas e devolve o que o teste configurar. */
export class PeopleGatewayStub extends PeopleGateway {
  people: Person[] = [];
  detail: PersonDetail | null = null;
  readonly queries: PeopleQuery[] = [];
  readonly calls: string[] = [];
  readonly creates: PersonInput[] = [];
  /** `Idempotency-Key` de cada `create`, na ordem. */
  readonly createKeys: string[] = [];
  readonly updates: PersonUpdate[] = [];
  /** Resultado das escritas (`create`, `update`, `archive`, `unarchive`). */
  next: Observable<Person> | null = null;
  getResult: Observable<PersonDetail> | null = null;
  listError: Observable<never> | null = null;

  list(query: PeopleQuery): Observable<Slice<Person>> {
    this.queries.push(query);
    if (this.listError) return this.listError;
    const wantsArchived = query.status === 'ARCHIVED';
    // O backend busca sem diferenciar maiúsculas e acentos.
    const norm = (text: string) =>
      text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLocaleLowerCase();
    const q = norm((query.q ?? '').trim());
    const filtered = this.people.filter(
      (p) => p.archived === wantsArchived && (q === '' || norm(p.name).includes(q)),
    );
    const start = (query.page - 1) * query.pageSize;
    const items = filtered.slice(start, start + query.pageSize);
    return of({ items, hasNext: start + query.pageSize < filtered.length });
  }

  get(id: string): Observable<PersonDetail> {
    this.calls.push(`get:${id}`);
    return this.getResult ?? of(this.detail ?? aPersonDetail({ id }));
  }

  create(input: PersonInput, idempotencyKey: string): Observable<Person> {
    this.createKeys.push(idempotencyKey);
    this.calls.push(`create:${input.name}`);
    this.creates.push(input);
    return (
      this.next ??
      of(
        aPerson({
          id: 'person-new',
          name: input.name,
          net: brl('0.00'),
          direction: 'NONE',
          openDebts: 0,
          nextDueDate: null,
        }),
      )
    );
  }

  update(id: string, input: PersonUpdate): Observable<Person> {
    this.calls.push(`update:${id}:${input.version}`);
    this.updates.push(input);
    return this.next ?? of(aPerson({ id, name: input.name, version: input.version + 1 }));
  }

  archive(id: string): Observable<Person> {
    this.calls.push(`archive:${id}`);
    return this.next ?? of(aPerson({ id, archived: true }));
  }

  unarchive(id: string): Observable<Person> {
    this.calls.push(`unarchive:${id}`);
    return this.next ?? of(aPerson({ id, archived: false }));
  }
}

export function providePeopleStub(stub: PeopleGatewayStub = new PeopleGatewayStub()): Provider[] {
  return [{ provide: PeopleGateway, useValue: stub }];
}
