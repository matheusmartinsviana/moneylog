import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';

import { CommitmentsGateway } from '~/modules/commitments/core/interfaces/commitments.gateway';
import type {
  Commitment,
  CommitmentInput,
  CommitmentProgressInput,
} from '~/modules/commitments/core/types/commitment';
import { brl } from '~/testing/accounts-testing';
import type { Slice } from '~/util/api/slice';

/** Projeto de longo prazo sintético: sinal pago, duas parcelas pendentes e financiamento. */
export function aProject(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: 'c-project',
    kind: 'LONG_TERM_PROJECT',
    name: 'Imóvel na planta',
    counterparty: 'Construtora',
    notes: null,
    total: brl('100000.00'),
    paid: brl('10000.00'),
    nominalBalance: brl('90000.00'),
    progress: '0.1000',
    installmentsTotal: null,
    installmentsPaid: null,
    remainingInstallments: null,
    nextDueDate: '2026-11-10',
    directPending: brl('20000.00'),
    financingPending: brl('70000.00'),
    pendingByMonth: [{ competence: '2026-11', amount: brl('10000.00') }],
    schedule: [
      {
        position: 1,
        label: 'Sinal',
        type: 'DOWN_PAYMENT',
        dueDate: '2026-04-10',
        amount: brl('10000.00'),
        paid: true,
        paidOn: '2026-04-10',
      },
      {
        position: 2,
        label: 'Parcela 1',
        type: 'INSTALLMENT',
        dueDate: '2026-11-10',
        amount: brl('10000.00'),
        paid: false,
        paidOn: null,
      },
      {
        position: 3,
        label: 'Financiamento',
        type: 'FINANCING',
        dueDate: null,
        amount: brl('70000.00'),
        paid: false,
        paidOn: null,
      },
    ],
    version: 3,
    ...overrides,
  };
}

/** Empréstimo no nome de terceiro: só o informado, sem saldo. */
export function aLoan(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: 'c-loan',
    kind: 'TRACKED_THIRD_PARTY',
    name: 'Empréstimo da Ana',
    counterparty: 'Ana',
    notes: null,
    total: null,
    paid: brl('400.00'),
    nominalBalance: null,
    progress: null,
    installmentsTotal: 12,
    installmentsPaid: 4,
    remainingInstallments: 8,
    nextDueDate: '2026-11-15',
    directPending: null,
    financingPending: null,
    pendingByMonth: [],
    schedule: [],
    version: 1,
    ...overrides,
  };
}

/** Porta falsa: guarda as chamadas e devolve o que o teste configurar. */
export class CommitmentsGatewayStub extends CommitmentsGateway {
  commitments: Commitment[] = [aLoan(), aProject()];
  list$: Observable<Slice<Commitment>> | null = null;
  get$: Observable<Commitment> | null = null;
  pay$: Observable<Commitment> | null = null;
  progress$: Observable<Commitment> | null = null;
  create$: Observable<Commitment> | null = null;
  readonly pays: { id: string; position: number; paidOn: string; version: number }[] = [];
  readonly progresses: { id: string; input: CommitmentProgressInput }[] = [];
  readonly creates: { input: CommitmentInput; key: string }[] = [];

  list(): Observable<Slice<Commitment>> {
    return this.list$ ?? of({ items: this.commitments, hasNext: false });
  }

  get(id: string): Observable<Commitment> {
    return this.get$ ?? of(this.commitments.find((c) => c.id === id) ?? aProject({ id }));
  }

  create(input: CommitmentInput, key: string): Observable<Commitment> {
    this.creates.push({ input, key });
    return this.create$ ?? of(aProject({ name: input.name }));
  }

  payItem(id: string, position: number, paidOn: string, version: number): Observable<Commitment> {
    this.pays.push({ id, position, paidOn, version });
    return this.pay$ ?? of(aProject({ version: version + 1 }));
  }

  updateProgress(id: string, input: CommitmentProgressInput): Observable<Commitment> {
    this.progresses.push({ id, input });
    return this.progress$ ?? of(aLoan({ installmentsPaid: input.installmentsPaid }));
  }
}

export function provideCommitmentsStub(
  stub: CommitmentsGatewayStub = new CommitmentsGatewayStub(),
): Provider[] {
  return [{ provide: CommitmentsGateway, useValue: stub }];
}
