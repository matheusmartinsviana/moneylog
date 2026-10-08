import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { CommitmentsGateway } from '~/modules/commitments/core/interfaces/commitments.gateway';
import { provideCommitments } from '~/modules/commitments/infra/commitments.providers';
import { COMMITMENT_ENDPOINTS } from '~/modules/commitments/infra/endpoints';
import type { CommitmentResponse } from '~/modules/commitments/infra/responses/commitment.response';
import { API_MOCKS } from '~/util/api-mocks';

const money = (amount: string) => ({ amount, currency: 'BRL' as const });

function loanResponse(): CommitmentResponse {
  return {
    id: 'c-loan',
    kind: 'TRACKED_THIRD_PARTY',
    name: 'Empréstimo',
    counterparty: 'Ana',
    notes: null,
    total: null,
    paid: money('400.00'),
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
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
  };
}

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideCommitments(),
    ],
  });
  return {
    gateway: TestBed.inject(CommitmentsGateway),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('CommitmentsRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o mock, então a lista vem vazia sem requisição', async () => {
    const { gateway, http } = setup(true);

    const slice = await firstValueFrom(gateway.list({ page: 1, pageSize: 50 }));

    expect(slice.items).toEqual([]);
    http.expectNone(() => true);
  });

  it('Dado a lista, então pagina e copia o que veio, com saldo nulo no empréstimo de terceiro', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.list({ page: 1, pageSize: 50 }));
    const req = http.expectOne((r) => r.url === COMMITMENT_ENDPOINTS.collection);
    expect(req.request.params.get('pageSize')).toBe('50');
    req.flush({ items: [loanResponse()], hasNext: false });

    const [loan] = (await result).items;
    expect(loan?.nominalBalance).toBeNull();
    expect(loan?.paid?.amount).toBe('400.00');
  });

  it('Dado criar um empréstimo, então o corpo leva só o informado e a Idempotency-Key', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(
      gateway.create(
        {
          kind: 'TRACKED_THIRD_PARTY',
          name: ' Empréstimo ',
          counterparty: 'Ana',
          notes: '',
          installmentsTotal: 12,
          installmentsPaid: 4,
          paidAmount: '400.00',
          nextDueDate: null,
          schedule: null,
        },
        'key-c',
      ),
    );
    const req = http.expectOne(COMMITMENT_ENDPOINTS.collection);
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-c');
    expect(req.request.body).toEqual({
      kind: 'TRACKED_THIRD_PARTY',
      name: 'Empréstimo',
      counterparty: 'Ana',
      installmentsTotal: 12,
      installmentsPaid: 4,
      paidAmount: '400.00',
    });
    req.flush(loanResponse());
    await result;
  });

  it('Dado criar um projeto, então o corpo leva o cronograma e nenhum total digitado', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(
      gateway.create(
        {
          kind: 'LONG_TERM_PROJECT',
          name: 'Imóvel',
          counterparty: null,
          notes: null,
          installmentsTotal: null,
          installmentsPaid: null,
          paidAmount: null,
          nextDueDate: null,
          schedule: [
            {
              label: 'Sinal',
              type: 'DOWN_PAYMENT',
              dueDate: '2026-04-10',
              amount: '10000.00',
              paid: true,
              paidOn: '2026-04-10',
            },
            {
              label: 'Parcela',
              type: 'INSTALLMENT',
              dueDate: null,
              amount: '500.00',
              paid: false,
              paidOn: null,
            },
          ],
        },
        'key-p',
      ),
    );
    const req = http.expectOne(COMMITMENT_ENDPOINTS.collection);
    expect(req.request.body).not.toHaveProperty('total');
    expect(req.request.body.schedule).toEqual([
      {
        label: 'Sinal',
        type: 'DOWN_PAYMENT',
        amount: '10000.00',
        paid: true,
        dueDate: '2026-04-10',
        paidOn: '2026-04-10',
      },
      { label: 'Parcela', type: 'INSTALLMENT', amount: '500.00', paid: false },
    ]);
    req.flush(loanResponse());
    await result;
  });

  it('Dado marcar parcela paga, então POST com a data e a versão na posição do item', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.payItem('c-1', 2, '2026-10-07', 3));
    const req = http.expectOne(COMMITMENT_ENDPOINTS.pay('c-1', 2));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ paidOn: '2026-10-07', version: 3 });
    req.flush(loanResponse());
    await result;
  });

  it('Dado atualizar o progresso, então POST com as parcelas pagas e a versão', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(
      gateway.updateProgress('c-1', {
        installmentsPaid: 5,
        paidAmount: null,
        nextDueDate: null,
        notes: ' ',
        version: 1,
      }),
    );
    const req = http.expectOne(COMMITMENT_ENDPOINTS.progress('c-1'));
    expect(req.request.body).toEqual({ installmentsPaid: 5, version: 1 });
    req.flush(loanResponse());
    await result;
  });
});
