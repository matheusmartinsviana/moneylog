import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { MonthlySummaryGateway } from '~/modules/monthly-summary/core/interfaces/monthly-summary.gateway';
import { SUMMARY_ENDPOINTS } from '~/modules/monthly-summary/infra/endpoints';
import { MonthlySummaryRequestsFacade } from '~/modules/monthly-summary/infra/facades/monthly-summary-requests.facade';
import { provideMonthlySummary } from '~/modules/monthly-summary/infra/monthly-summary.providers';
import { aSummaryResponse } from '~/testing/etapa5-testing';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideMonthlySummary(),
    ],
  });
  return {
    gateway: TestBed.inject(MonthlySummaryGateway),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('MonthlySummaryRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o bootstrap, então a porta é a facade de requisições', () => {
    const { gateway } = setup(true);
    expect(gateway).toBe(TestBed.inject(MonthlySummaryRequestsFacade));
  });

  it('Dado o mock, então o mês vem vazio e sem requisição; mês inválido dá 400', async () => {
    const { gateway, http } = setup(true);

    const summary = await firstValueFrom(gateway.get('2026-01'));
    expect(summary).toMatchObject({
      competence: '2026-01',
      savingsRate: null,
      largestExpense: null,
    });
    expect(summary.comparison.previousMonth.competence).toBe('2025-12');
    expect(summary.income.amount).toBe('0.00');
    await expect(firstValueFrom(gateway.get('2026-13'))).rejects.toMatchObject({
      problem: { status: 400, code: 'SUMMARY_MONTH_INVALID' },
    });
    http.expectNone(() => true);
  });

  it('Dado o mês, então copia tudo como o backend calculou', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.get('2026-10'));
    http.expectOne(SUMMARY_ENDPOINTS.month('2026-10')).flush(aSummaryResponse());

    const summary = await result;
    expect(summary.net.amount).toBe('2750.00');
    expect(summary.investments.amount).toBe('10000.00');
    expect(summary.largestCategory?.category.name).toBe('Tecnologia');
    expect(summary.largestExpense).toMatchObject({
      transactionId: 'tx-notebook',
      installmentNumber: 1,
      installmentTotal: 6,
    });
    expect(summary.card.outstanding.amount).toBe('200.00');
    expect(summary.comparison.expensesDelta).toEqual({
      amount: { amount: '100.00', currency: 'BRL' },
      percent: '0.6667',
    });
    expect(summary.comparison.investmentsDelta.percent).toBeNull();
  });

  it('Dado largestCategory e largestExpense nulos, então ficam nulos', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.get('2026-10'));
    http
      .expectOne(SUMMARY_ENDPOINTS.month('2026-10'))
      .flush(aSummaryResponse({ largestCategory: null, largestExpense: null, savingsRate: null }));

    expect(await result).toMatchObject({
      largestCategory: null,
      largestExpense: null,
      savingsRate: null,
    });
  });

  it('Dado SUMMARY_MONTH_INVALID, então vira ProblemError', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.get('2026-13'));
    http
      .expectOne(SUMMARY_ENDPOINTS.month('2026-13'))
      .flush(
        { status: 400, code: 'SUMMARY_MONTH_INVALID' },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(result).rejects.toMatchObject({ problem: { code: 'SUMMARY_MONTH_INVALID' } });
  });
});
