import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { DebtOverviewGateway } from '~/modules/debt-overview/core/interfaces/debt-overview.gateway';
import { provideDebtOverview } from '~/modules/debt-overview/infra/debt-overview.providers';
import { DEBT_OVERVIEW_ENDPOINTS } from '~/modules/debt-overview/infra/endpoints';
import { emptyOverview } from '~/modules/debt-overview/mock-data/empty-overview';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideDebtOverview(),
    ],
  });
  return {
    gateway: TestBed.inject(DebtOverviewGateway),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('DebtOverviewRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o mock, então nada cadastrado vem sem requisição', async () => {
    const { gateway, http } = setup(true);

    const overview = await firstValueFrom(gateway.get(6));

    expect(overview).toMatchObject({ hasRecords: false, schedule: { months: 6, points: [] } });
    http.expectNone(() => true);
  });

  it('Dado o horizonte, então vira ?months= e a resposta é copiada como veio', async () => {
    const { gateway, http } = setup(false);
    const raw = emptyOverview(24);
    raw.total = { amount: '6500.00', currency: 'BRL' };
    raw.hasRecords = true;
    raw.comparison.debtToIncome = '1.0833';

    const result = firstValueFrom(gateway.get(24));
    const req = http.expectOne((r) => r.url === DEBT_OVERVIEW_ENDPOINTS.overview);
    expect(req.request.params.get('months')).toBe('24');
    req.flush(raw);

    const overview = await result;
    expect(overview.total.amount).toBe('6500.00');
    expect(overview.comparison.debtToIncome).toBe('1.0833');
  });

  it('Dado compromissos acompanhados, então vêm à parte do total e sem saldo no empréstimo de terceiro', async () => {
    const { gateway, http } = setup(false);
    const raw = emptyOverview(12);
    raw.total = { amount: '0.00', currency: 'BRL' };
    raw.tracked = {
      items: [
        {
          id: 'c-1',
          kind: 'TRACKED_THIRD_PARTY',
          name: 'Empréstimo',
          counterparty: 'Ana',
          total: null,
          paid: { amount: '400.00', currency: 'BRL' },
          nominalBalance: null,
          progress: null,
          installmentsTotal: 12,
          installmentsPaid: 4,
          remainingInstallments: 8,
          nextDueDate: '2026-11-15',
          directPending: null,
        },
      ],
      scheduleByMonth: [{ competence: '2026-11', amount: { amount: '100.00', currency: 'BRL' } }],
    };

    const result = firstValueFrom(gateway.get(12));
    http.expectOne((r) => r.url === DEBT_OVERVIEW_ENDPOINTS.overview).flush(raw);

    const overview = await result;
    expect(overview.total.amount).toBe('0.00');
    expect(overview.tracked.items[0]?.nominalBalance).toBeNull();
    expect(overview.tracked.items[0]?.paid?.amount).toBe('400.00');
    expect(overview.tracked.scheduleByMonth[0]?.amount.amount).toBe('100.00');
  });

  it('Dado a prévia do parcelado, então posta o corpo do contrato e devolve o que falta', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(
      gateway.previewOngoing('c-1', {
        description: ' Notebook ',
        installmentAmount: '150.00',
        totalInstallments: 10,
        remainingInstallments: 8,
        firstInvoiceDate: null,
      }),
    );
    const req = http.expectOne(DEBT_OVERVIEW_ENDPOINTS.ongoingPreview('c-1'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      description: 'Notebook',
      installmentAmount: '150.00',
      totalInstallments: 10,
      remainingInstallments: 8,
    });
    req.flush({
      remainingInstallments: 8,
      installmentAmount: { amount: '150.00', currency: 'BRL' },
      remaining: { amount: '1200.00', currency: 'BRL' },
      firstDueDate: '2026-11-10',
      lastDueDate: '2027-06-10',
      purchase: {},
    });

    expect((await result).remaining.amount).toBe('1200.00');
  });

  it('Dado criar, então posta no cartão com a data da fatura e devolve o id da compra', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(
      gateway.createOngoing('c-1', {
        description: 'Notebook',
        installmentAmount: '150.00',
        totalInstallments: 10,
        remainingInstallments: 8,
        firstInvoiceDate: '2026-10-20',
      }),
    );
    const req = http.expectOne(DEBT_OVERVIEW_ENDPOINTS.ongoing('c-1'));
    expect(req.request.body).toMatchObject({ firstInvoiceDate: '2026-10-20' });
    req.flush({ id: 'tx-1' });

    expect(await result).toBe('tx-1');
  });

  it('Dado 422, então a falha chega como problema tipado', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(
      gateway.createOngoing('c-1', {
        description: 'x',
        installmentAmount: '1.00',
        totalInstallments: 2,
        remainingInstallments: 3,
        firstInvoiceDate: null,
      }),
    );
    http
      .expectOne(DEBT_OVERVIEW_ENDPOINTS.ongoing('c-1'))
      .flush({ code: 'ONGOING_INVALID_COUNT', status: 422 }, { status: 422, statusText: 'x' });

    await expect(result).rejects.toMatchObject({ problem: { code: 'ONGOING_INVALID_COUNT' } });
  });
});
