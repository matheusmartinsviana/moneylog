import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ReportsGateway } from '~/modules/reports/core/interfaces/reports.gateway';
import { REPORTS_ENDPOINTS } from '~/modules/reports/infra/endpoints';
import { ReportsRequestsFacade } from '~/modules/reports/infra/facades/reports-requests.facade';
import { provideReports } from '~/modules/reports/infra/reports.providers';
import {
  anIncomeExpenseSeriesResponse,
  aSpendingByCategoryResponse,
} from '~/testing/reports-testing';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideReports(),
    ],
  });
  return { gateway: TestBed.inject(ReportsGateway), http: TestBed.inject(HttpTestingController) };
}

describe('ReportsRequestsFacade', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    delete (globalThis as Record<string, unknown>)['__MONEYLOG_MOCK_RESPONSES__'];
  });

  it('Dado o bootstrap de produção, então a porta é a facade HTTP e não é de demonstração', () => {
    const { gateway } = setup(false);
    expect(gateway).toBeInstanceOf(ReportsRequestsFacade);
    expect(gateway.isDemo).toBe(false);
  });

  it('Dado o período, então pede /v1/reports/income-expenses?period= e copia a série do contrato', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.incomeExpenses('D7'));
    const request = http.expectOne(
      (r) => r.url === REPORTS_ENDPOINTS.incomeExpenses && r.params.get('period') === 'D7',
    );
    expect(request.request.method).toBe('GET');
    request.flush(anIncomeExpenseSeriesResponse());

    const series = await result;
    expect(series).toMatchObject({ period: 'D7', basis: 'DATE', granularity: 'DAY' });
    expect(series.points).toHaveLength(7);
    // Negativo legítimo (dia só com reembolso): nada de sanear ou somar.
    expect(series.points[5]?.expenses.amount).toBe('-50.00');
    expect(series.points[6]?.partial).toBe(true);
    expect(series.totals).toEqual({
      income: { amount: '3000.00', currency: 'BRL' },
      expenses: { amount: '250.00', currency: 'BRL' },
      net: { amount: '2750.00', currency: 'BRL' },
    });
  });

  it('Dado o mês, então pede spending-by-category com month e limit e copia share, base e "Outras"', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.spendingByCategory('2026-10', 3));
    const request = http.expectOne(
      (r) =>
        r.url === REPORTS_ENDPOINTS.spendingByCategory &&
        r.params.get('month') === '2026-10' &&
        r.params.get('limit') === '3',
    );
    request.flush(aSpendingByCategoryResponse());

    const report = await result;
    expect(report.total.amount).toBe('250.00');
    expect(report.base.amount).toBe('250.00');
    expect(report.items[0]).toMatchObject({ category: { name: 'Tecnologia' }, share: '0.8000' });
    expect(report.other).toEqual({
      amount: { amount: '50.00', currency: 'BRL' },
      share: '0.2000',
      categories: 1,
    });
  });

  it('Dado "other" nulo e share nulo (base zero), então copia os nulos', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.spendingByCategory('2026-10'));
    http
      .expectOne((r) => r.url === REPORTS_ENDPOINTS.spendingByCategory)
      .flush(
        aSpendingByCategoryResponse({
          total: { amount: '0.00', currency: 'BRL' },
          base: { amount: '0.00', currency: 'BRL' },
          items: [],
          other: null,
        }),
      );

    const report = await result;
    expect(report.items).toEqual([]);
    expect(report.other).toBeNull();
  });

  it('Dado 400 REPORT_PERIOD_INVALID, então falha com o Problem do contrato', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.incomeExpenses('D7'));
    http
      .expectOne((r) => r.url === REPORTS_ENDPOINTS.incomeExpenses)
      .flush({ code: 'REPORT_PERIOD_INVALID', status: 400 }, { status: 400, statusText: 'Bad' });

    await expect(result).rejects.toMatchObject({
      problem: { status: 400, code: 'REPORT_PERIOD_INVALID' },
    });
  });

  it('Dado o mock, então a série vem vazia, sem requisição e sem dado de demonstração', async () => {
    const { gateway, http } = setup(true);

    const series = await firstValueFrom(gateway.incomeExpenses('M12'));
    const report = await firstValueFrom(gateway.spendingByCategory('2026-10'));

    expect(series.points).toEqual([]);
    expect(series.basis).toBe('COMPETENCE');
    expect(report.items).toEqual([]);
    expect(report.other).toBeNull();
    http.expectNone(() => true);
  });

  it('Dado o mock com a resposta deixada pelo E2E, então usa o JSON bruto da chave', async () => {
    (globalThis as Record<string, unknown>)['__MONEYLOG_MOCK_RESPONSES__'] = {
      '/v1/reports/income-expenses?period=D7': anIncomeExpenseSeriesResponse(),
    };
    const { gateway, http } = setup(true);

    const series = await firstValueFrom(gateway.incomeExpenses('D7'));
    const other = await firstValueFrom(gateway.incomeExpenses('D30'));

    expect(series.points).toHaveLength(7);
    expect(other.points).toEqual([]);
    http.expectNone(() => true);
  });
});
