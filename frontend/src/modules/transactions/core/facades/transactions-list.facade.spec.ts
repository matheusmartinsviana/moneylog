import { TestBed } from '@angular/core/testing';
import { NEVER, Subject, of } from 'rxjs';

import { TransactionsEvents } from '~/modules/transactions/core/facades/transactions-events';
import {
  LIST_PAGE_SIZE,
  TransactionsListFacade,
} from '~/modules/transactions/core/facades/transactions-list.facade';
import type {
  EntrySlice,
  TransactionSlice,
} from '~/modules/transactions/core/interfaces/transactions.gateway';
import { defaultFilters } from '~/modules/transactions/core/types/list-filters';
import { brl, failWith } from '~/testing/accounts-testing';
import {
  aTransaction,
  anEntry,
  provideTransactionsStub,
  someTotals,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';
import { todayIso } from '~/util/date';

function setup(gateway = new TransactionsGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideTransactionsStub(gateway), TransactionsListFacade],
  });
  return { gateway, facade: TestBed.inject(TransactionsListFacade) };
}

const base = () => defaultFilters(todayIso());
const page = (ids: string[], hasNext: boolean, totals = someTotals(7)): TransactionSlice => ({
  items: ids.map((id) => aTransaction({ id })),
  hasNext,
  totals,
});

describe('TransactionsListFacade', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado a primeira aplicação, então carrega a página 1 de 50 e expõe os totais recebidos', () => {
    const { gateway, facade } = setup();

    facade.apply(base());

    expect(gateway.listCalls).toHaveLength(1);
    expect(gateway.listCalls[0]).toMatchObject({ page: 1, pageSize: LIST_PAGE_SIZE });
    expect(facade.data()?.records).toHaveLength(1);
    expect(facade.data()?.recordTotals).toEqual(someTotals(1));
  });

  it('Dado a mesma aplicação repetida, então não recarrega (só quando algo muda)', () => {
    const { gateway, facade } = setup();

    facade.apply(base());
    facade.apply({ ...base() });
    facade.patch({ q: '   ' });

    expect(gateway.listCalls).toHaveLength(1);
  });

  it('Dado nenhum item, então "empty"', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.list$ = () => of({ items: [], hasNext: false, totals: someTotals(0) });
    const { facade } = setup(gateway);

    facade.apply(base());

    expect(facade.empty()).toBe(true);
  });

  it('Dado erro, então "error" com o Problem e o "tentar de novo" recarrega', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.list$ = () => failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);
    facade.apply(base());
    expect(facade.error()?.code).toBe('INTERNAL_ERROR');

    gateway.list$ = () => of(page(['a'], false));
    facade.reload();

    expect(facade.data()?.records.map((t) => t.id)).toEqual(['a']);
  });

  it('Dado "carregar mais", então pede a página seguinte, anexa os itens e mostra os totais da última resposta (sem somar)', () => {
    const gateway = new TransactionsGatewayStub();
    const totals = someTotals(7);
    gateway.list$ = (n) =>
      of(n === 1 ? page(['a', 'b'], true, totals) : page(['c'], false, totals));
    const { facade } = setup(gateway);
    facade.apply(base());

    facade.loadMore();

    expect(gateway.listCalls.map((c) => c.page)).toEqual([1, 2]);
    expect(facade.data()?.records.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(facade.data()?.recordTotals).toBe(totals);
    expect(facade.data()?.recordTotals).toEqual(someTotals(7));
    expect(facade.data()?.hasNext).toBe(false);
  });

  it('Dado os totais mudando entre páginas, então vale sempre o da última resposta', () => {
    const gateway = new TransactionsGatewayStub();
    const last = { count: 99, cashFlow: { in: brl('1.00'), out: brl('2.00'), net: brl('-1.00') } };
    gateway.list$ = (n) =>
      of(n === 1 ? page(['a'], true, someTotals(1)) : page(['b'], false, last));
    const { facade } = setup(gateway);
    facade.apply(base());

    facade.loadMore();

    expect(facade.data()?.recordTotals).toEqual(last);
  });

  it('Dado "carregar mais" sem próxima página, então não faz requisição', () => {
    const { gateway, facade } = setup();
    facade.apply(base());

    facade.loadMore();

    expect(gateway.listCalls).toHaveLength(1);
  });

  it('Dado "carregar mais" em andamento, então o clique repetido é ignorado', () => {
    const gateway = new TransactionsGatewayStub();
    const next = new Subject<TransactionSlice>();
    gateway.list$ = (n) => (n === 1 ? of(page(['a'], true)) : next);
    const { facade } = setup(gateway);
    facade.apply(base());

    facade.loadMore();
    facade.loadMore();

    expect(gateway.listCalls.map((c) => c.page)).toEqual([1, 2]);
    expect(facade.loadingMore()).toBe(true);
    next.next(page(['b'], false));
    next.complete();
    expect(facade.loadingMore()).toBe(false);
  });

  it('Dado falha ao carregar mais, então a lista já exibida continua e o erro é sinalizado', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.list$ = (n) => (n === 1 ? of(page(['a'], true)) : failWith(500, 'INTERNAL_ERROR'));
    const { facade } = setup(gateway);
    facade.apply(base());

    facade.loadMore();

    expect(facade.data()?.records).toHaveLength(1);
    expect(facade.loadMoreFailed()).toBe(true);
    expect(facade.loadingMore()).toBe(false);
  });

  it('Dado uma recarga durante o "carregar mais", então a resposta antiga é descartada', () => {
    const gateway = new TransactionsGatewayStub();
    const stale = new Subject<TransactionSlice>();
    let calls = 0;
    gateway.list$ = (n) => {
      calls++;
      if (n === 2) return stale;
      return of(page(calls > 2 ? ['novo'] : ['a'], n === 1 && calls === 1));
    };
    const { facade } = setup(gateway);
    facade.apply(base());
    facade.loadMore();

    facade.patch({ type: 'INCOME' });
    stale.next(page(['velho'], false));
    stale.complete();

    expect(facade.data()?.records.map((t) => t.id)).toEqual(['novo']);
  });

  it('Dado a mudança de filtro com a requisição anterior pendente, então a anterior é cancelada (switchMap)', () => {
    const gateway = new TransactionsGatewayStub();
    const first = new Subject<TransactionSlice>();
    let n = 0;
    gateway.list$ = () => (++n === 1 ? first : of(page(['b'], false)));
    const { facade } = setup(gateway);
    facade.apply(base());

    facade.patch({ method: 'PIX' });
    first.next(page(['a'], false));

    expect(facade.data()?.records.map((t) => t.id)).toEqual(['b']);
    expect(first.observed).toBe(false);
  });

  it('Dado a busca digitada, então espera 300 ms parado e cancela a requisição anterior', () => {
    vi.useFakeTimers();
    const gateway = new TransactionsGatewayStub();
    const { facade } = setup(gateway);
    facade.apply(base());
    gateway.listCalls.length = 0;

    facade.search('c');
    vi.advanceTimersByTime(200);
    facade.search('ca');
    vi.advanceTimersByTime(299);
    expect(gateway.listCalls).toHaveLength(0);
    vi.advanceTimersByTime(1);

    expect(gateway.listCalls).toHaveLength(1);
    expect(gateway.listCalls[0]!.filters.q).toBe('ca');
    expect(facade.filters().q).toBe('ca');
  });

  it('Dado a mesma busca repetida, então não recarrega de novo', () => {
    vi.useFakeTimers();
    const { gateway, facade } = setup();
    facade.apply(base());
    facade.search('ca');
    vi.advanceTimersByTime(300);

    facade.search('ca');
    vi.advanceTimersByTime(300);

    expect(gateway.listCalls).toHaveLength(2);
  });

  it('Dado a visão por competência, então usa o endpoint de lançamentos e expõe os totais por categoria recebidos', () => {
    const gateway = new TransactionsGatewayStub();
    const slice: EntrySlice = {
      items: [anEntry(), anEntry({ transactionId: 'tx-2', amount: brl('-10.00') })],
      hasNext: false,
      totals: {
        total: brl('99.99'),
        byCategory: [{ category: { id: 'cat-1', name: 'Alimentação' }, amount: brl('99.99') }],
      },
    };
    gateway.entries$ = () => of(slice);
    const { facade } = setup(gateway);

    facade.apply({ ...base(), view: 'entries' });

    expect(gateway.listCalls).toHaveLength(0);
    expect(gateway.entryCalls[0]).toMatchObject({ page: 1, pageSize: LIST_PAGE_SIZE });
    expect(facade.data()?.view).toBe('entries');
    expect(facade.data()?.entries).toHaveLength(2);
    expect(facade.data()?.entryTotals).toEqual(slice.totals);
  });

  it('Dado "carregar mais" na visão por competência, então anexa os lançamentos e usa os totais da última resposta', () => {
    const gateway = new TransactionsGatewayStub();
    const totals = { total: brl('5.00'), byCategory: [] };
    gateway.entries$ = (n) =>
      of({ items: [anEntry({ transactionId: `t${n}` })], hasNext: n === 1, totals });
    const { facade } = setup(gateway);
    facade.apply({ ...base(), view: 'entries' });

    facade.loadMore();

    expect(facade.data()?.entries.map((e) => e.transactionId)).toEqual(['t1', 't2']);
    expect(facade.data()?.entryTotals).toBe(totals);
  });

  it('Dado "carregar mais" com debtItems só na página 1 (S-238), então a linha de dívida não duplica nem some, e os totais são os da última resposta', () => {
    const gateway = new TransactionsGatewayStub();
    const debtItem = {
      debtId: 'debt-1',
      date: '2026-10-05',
      competence: '2026-10',
      description: 'Jantar que a Maria pagou',
      category: { id: 'cat-food', name: 'Alimentação' },
      amount: brl('60.00'),
    };
    const totals = (total: string) => ({ total: brl(total), byCategory: [] });
    gateway.entries$ = (n) =>
      of({
        items: [anEntry({ transactionId: `t${n}` })],
        hasNext: n < 3,
        // O backend manda as linhas de dívida só em `page = 1`; nas demais, `[]`.
        debtItems: n === 1 ? [debtItem] : [],
        totals: totals(`${n}00.00`),
      });
    const { facade } = setup(gateway);
    facade.apply({ ...base(), view: 'entries' });

    facade.loadMore();
    facade.loadMore();

    expect(facade.data()?.entries.map((e) => e.transactionId)).toEqual(['t1', 't2', 't3']);
    expect(facade.data()?.debtItems).toEqual([debtItem]);
    expect(facade.data()?.entryTotals?.total.amount).toBe('300.00');
  });

  it('Dado a página 1 sem movimentações mas com debtItems, então a lista não é vazia', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.entries$ = () =>
      of({
        items: [],
        hasNext: false,
        debtItems: [
          {
            debtId: 'debt-1',
            date: '2026-10-05',
            competence: '2026-10',
            description: 'Jantar',
            category: { id: 'c', name: 'Alimentação' },
            amount: brl('60.00'),
          },
        ],
        totals: { total: brl('60.00'), byCategory: [] },
      });
    const { facade } = setup(gateway);

    facade.apply({ ...base(), view: 'entries' });

    expect(facade.state().status).toBe('ready');
    expect(facade.data()?.debtItems).toHaveLength(1);
  });

  it('Dado uma movimentação criada, editada ou estornada, então recarrega do backend', () => {
    const { gateway, facade } = setup();
    facade.apply(base());

    TestBed.inject(TransactionsEvents).notifyChanged();

    expect(gateway.listCalls).toHaveLength(2);
  });

  it('Dado nada aplicado ainda, então um aviso de mudança não dispara requisição', () => {
    const { gateway } = setup();

    TestBed.inject(TransactionsEvents).notifyChanged();

    expect(gateway.listCalls).toHaveLength(0);
  });

  it('Dado "limpar filtros", então volta aos padrões e mantém a visão', () => {
    const { gateway, facade } = setup();
    facade.apply({ ...base(), view: 'entries', method: 'PIX', q: 'x' });

    facade.clearFilters();

    expect(facade.filters()).toEqual({ ...base(), view: 'entries' });
    expect(gateway.entryCalls).toHaveLength(2);
  });

  it('Dado a carga pendente, então expõe "loading"', () => {
    const gateway = new TransactionsGatewayStub();
    gateway.list$ = () => NEVER;
    const { facade } = setup(gateway);

    facade.apply(base());

    expect(facade.loading()).toBe(true);
  });
});
