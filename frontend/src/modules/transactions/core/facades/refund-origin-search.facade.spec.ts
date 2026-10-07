import { TestBed } from '@angular/core/testing';
import { NEVER, of } from 'rxjs';

import { RefundOriginSearchFacade } from '~/modules/transactions/core/facades/refund-origin-search.facade';
import { failWith } from '~/testing/accounts-testing';
import {
  aTransaction,
  provideTransactionsStub,
  someTotals,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';
import { todayIso } from '~/util/date';

function setup(gateway = new TransactionsGatewayStub()) {
  vi.useFakeTimers();
  TestBed.configureTestingModule({
    providers: [provideTransactionsStub(gateway), RefundOriginSearchFacade],
  });
  return { gateway, facade: TestBed.inject(RefundOriginSearchFacade) };
}

describe('RefundOriginSearchFacade', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado nada digitado, então não há busca nem resultados', () => {
    const { facade, gateway } = setup();

    expect(facade.results()).toBeNull();
    expect(gateway.listCalls).toHaveLength(0);
  });

  it('Dado um texto, então espera 300 ms parado e pede só despesas ativas dos últimos meses, 10 por página', () => {
    const { facade, gateway } = setup();
    gateway.list$ = () =>
      of({ items: [aTransaction({ id: 'orig' })], hasNext: false, totals: someTotals(1) });

    facade.search('jan');
    vi.advanceTimersByTime(200);
    facade.search('jant');
    vi.advanceTimersByTime(299);
    expect(gateway.listCalls).toHaveLength(0);
    vi.advanceTimersByTime(1);

    expect(gateway.listCalls).toHaveLength(1);
    const { filters, page, pageSize } = gateway.listCalls[0]!;
    expect(filters).toMatchObject({ type: 'EXPENSE', q: 'jant', status: 'ACTIVE' });
    expect(filters.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(filters.from! < todayIso().slice(0, 7)).toBe(true);
    expect(filters.to! >= todayIso()).toBe(true);
    expect([page, pageSize]).toEqual([1, 10]);
    expect(facade.results()?.map((t) => t.id)).toEqual(['orig']);
    expect(facade.searching()).toBe(false);
  });

  it('Dado a busca em andamento, então searching é true; texto vazio cancela e limpa na hora', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.list$ = () => NEVER;
    const { facade } = setup(gateway);

    facade.search('jantar');
    vi.advanceTimersByTime(300);
    expect(facade.searching()).toBe(true);

    facade.search('  ');
    expect(facade.searching()).toBe(false);
    expect(facade.results()).toBeNull();
  });

  it('Dado falha na busca, então vira lista vazia (a busca é opcional)', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.list$ = () => failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.search('jantar');
    vi.advanceTimersByTime(300);

    expect(facade.results()).toEqual([]);
  });
});
