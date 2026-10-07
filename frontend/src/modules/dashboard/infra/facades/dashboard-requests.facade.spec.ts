import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { DashboardFacade } from '~/modules/dashboard/core/facades/dashboard.facade';
import { DashboardGateway } from '~/modules/dashboard/core/interfaces/dashboard.gateway';
import { DashboardFailure } from '~/modules/dashboard/core/types/dashboard-failure';
import { provideDashboard } from '~/modules/dashboard/infra/dashboard.providers';
import { DASHBOARD_ENDPOINTS } from '~/modules/dashboard/infra/endpoints';
import { DashboardRequestsFacade } from '~/modules/dashboard/infra/facades/dashboard-requests.facade';
import type {
  DashboardSummaryResponse,
  MoneyResponse,
  UpcomingResponse,
} from '~/modules/dashboard/infra/responses/dashboard-summary.response';
import {
  EMPTY_DASHBOARD_SUMMARY,
  EMPTY_UPCOMING,
} from '~/modules/dashboard/mock-data/empty-dashboard';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideDashboard(),
    ],
  });
  return {
    gateway: TestBed.inject(DashboardGateway),
    http: TestBed.inject(HttpTestingController),
  };
}

/** Resposta da API com valores distintos em cada campo, para pegar troca de campo no mapeamento. */
function summaryResponse(): DashboardSummaryResponse {
  let n = 0;
  const m = (): MoneyResponse => ({ amount: `${++n}.00`, currency: 'BRL' });
  return {
    asOf: '2026-10-10',
    isProjection: true,
    hasAccounts: true,
    balances: {
      inAccounts: m(),
      investments: m(),
      available: m(),
      reserved: m(),
      committed30d: m(),
    },
    committed: { d7: m(), d30: m(), d60: m(), d90: m(), m6: m(), m12: m() },
    projected: { d30: m(), d90: m(), m6: m(), m12: m() },
    month: {
      competence: '2026-10',
      income: m(),
      expensesPaid: {
        total: m(),
        byMethod: { DEBIT: m(), PIX: m(), CASH: m(), BOLETO: m(), TRANSFER: m(), OTHER: m() },
      },
      credit: m(),
      refunds: m(),
      consumption: m(),
      debtConsumption: m(),
      cashFlow: { in: m(), out: m(), net: m() },
      investedNet: m(),
      lent: m(),
      received: m(),
      net: m(),
    },
    netWorth: {
      accounts: m(),
      receivables: m(),
      cardLiabilities: m(),
      payables: m(),
      total: m(),
      cardFutureInstallments: m(),
    },
  };
}

describe('DashboardRequestsFacade', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    delete (globalThis as Record<string, unknown>)['__MONEYLOG_MOCK_RESPONSES__'];
  });

  it('Dado o bootstrap, então a porta DashboardGateway é a facade de requisições', () => {
    const { gateway } = setup(true);

    expect(gateway).toBe(TestBed.inject(DashboardRequestsFacade));
  });

  describe('em modo mock (Etapa 1)', () => {
    it('Dado o mock, quando peço o resumo e os próximos, então recebo o resumo vazio mapeado', async () => {
      const { gateway, http } = setup(true);

      const summary = await firstValueFrom(gateway.getSummary());
      const upcoming = await firstValueFrom(gateway.getUpcoming());

      // O mock vazio não traz a variação do saldo (campo opcional do contrato): o mapper a normaliza para null.
      expect(summary).toEqual({
        ...EMPTY_DASHBOARD_SUMMARY,
        balances: { ...EMPTY_DASHBOARD_SUMMARY.balances, inAccountsChange: null },
      });
      expect(summary.balances.available).toEqual({ amount: '0.00', currency: 'BRL' });
      expect(upcoming).toEqual(EMPTY_UPCOMING);
      http.expectNone(() => true);
    });
  });

  describe('em modo mock com a resposta deixada pelo E2E', () => {
    it('Dado a chave do endpoint, então usa o JSON bruto no lugar do resumo vazio', async () => {
      (globalThis as Record<string, unknown>)['__MONEYLOG_MOCK_RESPONSES__'] = {
        [DASHBOARD_ENDPOINTS.summary]: summaryResponse(),
      };
      const { gateway, http } = setup(true);

      const summary = await firstValueFrom(gateway.getSummary());

      expect(summary.balances.inAccounts.amount).toBe('1.00');
      expect(summary.hasAccounts).toBe(true);
      http.expectNone(() => true);
    });
  });

  describe('com a API (Etapa 2, preparado)', () => {
    it('Dado a API, quando peço o resumo, então chama GET /v1/dashboard/summary e mapeia campo a campo', async () => {
      const { gateway, http } = setup(false);
      const response = summaryResponse();

      const result = firstValueFrom(gateway.getSummary());
      const req = http.expectOne(DASHBOARD_ENDPOINTS.summary);
      expect(req.request.method).toBe('GET');
      req.flush(response);

      // `inAccountsChange` é opcional no contrato 2.6.0: ausente vira null (sem chip na tela).
      expect(await result).toEqual({
        ...response,
        balances: { ...response.balances, inAccountsChange: null },
      });
    });

    it('Dado inAccountsChange (2.6.0), quando peço o resumo, então copia previous, amount, percent e since sem calcular', async () => {
      const { gateway, http } = setup(false);
      const response = summaryResponse();
      response.balances.inAccountsChange = {
        previous: { amount: '17500.00', currency: 'BRL' },
        amount: { amount: '1400.00', currency: 'BRL' },
        percent: '0.0800',
        since: '2026-09-30',
      };

      const result = firstValueFrom(gateway.getSummary());
      http.expectOne(DASHBOARD_ENDPOINTS.summary).flush(response);

      expect((await result).balances.inAccountsChange).toEqual({
        previous: { amount: '17500.00', currency: 'BRL' },
        amount: { amount: '1400.00', currency: 'BRL' },
        percent: '0.0800',
        since: '2026-09-30',
      });
    });

    it('Dado inAccountsChange com percent nulo (base zero), então mantém o nulo', async () => {
      const { gateway, http } = setup(false);
      const response = summaryResponse();
      response.balances.inAccountsChange = {
        previous: { amount: '0.00', currency: 'BRL' },
        amount: { amount: '500.00', currency: 'BRL' },
        percent: null,
        since: '2026-09-30',
      };

      const result = firstValueFrom(gateway.getSummary());
      http.expectOne(DASHBOARD_ENDPOINTS.summary).flush(response);

      expect((await result).balances.inAccountsChange?.percent).toBeNull();
    });

    it('Dado item sem bucket, quando peço os próximos, então normaliza o bucket ausente para null', async () => {
      const { gateway, http } = setup(false);
      // O contrato torna `bucket` opcional/nullable: o item sem data pode omiti-lo.
      const response: UpcomingResponse = {
        items: [
          {
            kind: 'INVOICE',
            bucket: 'TODAY',
            dueDate: '2026-10-10',
            direction: 'OUT',
            amount: { amount: '1283.00', currency: 'BRL' },
            label: 'Roxinho',
            refType: 'INVOICE',
            refId: 'inv-1',
            items: [
              {
                kind: 'INSTALLMENT',
                label: 'Notebook',
                installment: { number: 4, total: 10 },
                amount: { amount: '320.00', currency: 'BRL' },
                informational: true,
              },
            ],
          },
        ],
        undated: [
          {
            kind: 'DEBT_PAYABLE',
            dueDate: null,
            direction: 'OUT',
            amount: { amount: '80.00', currency: 'BRL' },
            label: 'Maria',
            refType: 'DEBT',
            refId: 'debt-2',
            items: [],
          },
        ],
        totals: {
          out: { amount: '1363.00', currency: 'BRL' },
          in: { amount: '0.00', currency: 'BRL' },
        },
      };

      const result = firstValueFrom(gateway.getUpcoming());
      http.expectOne(DASHBOARD_ENDPOINTS.upcoming).flush(response);
      const upcoming = await result;

      expect(upcoming.items[0]?.items).toEqual(response.items[0]?.items);
      expect(upcoming.undated[0]).toMatchObject({ bucket: null, dueDate: null, items: [] });
      expect(upcoming.totals).toEqual(response.totals);
    });

    it.each([
      [403, 'forbidden'],
      [500, 'unavailable'],
      [503, 'unavailable'],
    ])(
      'Dado HTTP %i, quando peço o resumo, então falha com DashboardFailure "%s"',
      async (status, reason) => {
        const { gateway, http } = setup(false);

        const result = firstValueFrom(gateway.getSummary());
        http.expectOne(DASHBOARD_ENDPOINTS.summary).flush(null, { status, statusText: 'x' });

        await expect(result).rejects.toBeInstanceOf(DashboardFailure);
        await expect(result).rejects.toMatchObject({ reason });
      },
    );

    it('Dado o Início carregando pela API, então saem exatamente 2 requisições (resumo e próximos) e nenhuma a /v1/accounts', () => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: API_MOCKS, useValue: false },
          provideDashboard(),
          DashboardFacade,
        ],
      });
      const facade = TestBed.inject(DashboardFacade);
      const http = TestBed.inject(HttpTestingController);

      facade.load();

      const urls = http
        .match(() => true)
        .map((req) => {
          if (req.request.url === DASHBOARD_ENDPOINTS.summary) {
            req.flush({ ...summaryResponse(), hasAccounts: false });
          } else {
            req.flush({
              items: [],
              undated: [],
              totals: {
                out: { amount: '0.00', currency: 'BRL' },
                in: { amount: '0.00', currency: 'BRL' },
              },
            });
          }
          return req.request.url;
        });
      expect(urls.sort()).toEqual(
        [DASHBOARD_ENDPOINTS.summary, DASHBOARD_ENDPOINTS.upcoming].sort(),
      );
      expect(facade.state().status).toBe('empty');
    });
  });
});
