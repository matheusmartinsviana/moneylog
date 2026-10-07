import { TestBed } from '@angular/core/testing';
import { NEVER, of, Subject, throwError } from 'rxjs';

import {
  GLOBAL_SEARCH_DEBOUNCE_MS,
  SearchFacade,
} from '~/modules/search/core/facades/search.facade';
import type { SearchResults } from '~/modules/search/core/types/search';
import { aProblem } from '~/testing/accounts-testing';
import { aSearchResults, provideSearchStub, SearchGatewayStub } from '~/testing/reports-testing';
import { ProblemError } from '~/util/api/problem';

function setup(stub = new SearchGatewayStub()) {
  vi.useFakeTimers();
  TestBed.configureTestingModule({ providers: [provideSearchStub(stub), SearchFacade] });
  return { stub, facade: TestBed.inject(SearchFacade) };
}

const wait = (ms = GLOBAL_SEARCH_DEBOUNCE_MS) => vi.advanceTimersByTime(ms);

describe('SearchFacade', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado digitação seguida, então só pede depois de 300 ms parado, uma vez, com o termo limpo', () => {
    const { facade, stub } = setup();

    facade.type('me');
    wait(200);
    facade.type('mer');
    wait(200);
    facade.type('  merc\u0000ado  ');
    expect(stub.queries).toEqual([]);
    wait();

    expect(stub.queries).toEqual(['merc ado']);
    expect(facade.state().status).toBe('ready');
  });

  it('Dado menos de 2 caracteres, então nenhuma requisição sai e o estado volta a idle', () => {
    const { facade, stub } = setup();
    facade.type('mercado');
    wait();
    expect(facade.state().status).toBe('ready');

    facade.type('m');
    wait();

    expect(facade.state().status).toBe('idle');
    expect(stub.queries).toEqual(['mercado']);
    expect(facade.query()).toBeNull();
  });

  it('Dado um termo novo, então mostra "carregando" na hora (sem deixar o resultado velho à mão)', () => {
    const { facade } = setup();
    facade.type('mercado');
    wait();
    expect(facade.data()?.q).toBe('mercado');

    facade.type('mercados');

    expect(facade.state().status).toBe('loading');
    expect(facade.data()).toBeNull();
  });

  it('Dado o mesmo termo já mostrado (só um espaço a mais), então não repete a requisição', () => {
    const { facade, stub } = setup();
    facade.type('mercado');
    wait();

    facade.type('mercado ');
    wait();

    expect(stub.queries).toEqual(['mercado']);
    expect(facade.state().status).toBe('ready');
  });

  it('Dado outra digitação com a requisição anterior em voo, então cancela a anterior e só a última vence', () => {
    const stub = new SearchGatewayStub();
    const first = new Subject<SearchResults>();
    const second = new Subject<SearchResults>();
    stub.result = (q) => (q === 'ab' ? first : second);
    const { facade } = setup(stub);

    facade.type('ab');
    wait();
    expect(first.observed).toBe(true);
    facade.type('abc');
    wait();
    expect(first.observed).toBe(false);
    first.next(aSearchResults({ q: 'ab' }));
    expect(facade.state().status).toBe('loading');
    second.next(aSearchResults({ q: 'abc' }));

    expect(facade.data()?.q).toBe('abc');
  });

  it('Dado apagar o campo com a requisição em voo, então cancela e volta a idle', () => {
    const stub = new SearchGatewayStub();
    stub.result = () => NEVER;
    const { facade } = setup(stub);
    facade.type('mercado');
    wait();
    expect(facade.state().status).toBe('loading');

    facade.type('');

    expect(facade.state().status).toBe('idle');
  });

  it('Dado nenhum grupo com resultado, então o estado é "empty" com o termo', () => {
    const stub = new SearchGatewayStub();
    stub.result = (q) =>
      of(
        aSearchResults({
          q,
          transactions: [],
          accounts: [],
          categories: [],
          cards: [],
          notes: [],
        }),
      );
    const { facade } = setup(stub);

    facade.type('zzz');
    wait();

    expect(facade.state()).toEqual({ status: 'empty', q: 'zzz' });
  });

  it('Dado os tipos de falha, então classifica 429, SEARCH_QUERY_INVALID e o resto', () => {
    const stub = new SearchGatewayStub();
    const { facade } = setup(stub);

    stub.result = () => throwError(() => new ProblemError(aProblem(429, 'TOO_MANY_ATTEMPTS')));
    facade.type('mercado');
    wait();
    expect(facade.state()).toMatchObject({ status: 'error', kind: 'rateLimit' });

    stub.result = () => throwError(() => new ProblemError(aProblem(400, 'SEARCH_QUERY_INVALID')));
    facade.type('mercadoo');
    wait();
    expect(facade.state()).toMatchObject({ status: 'error', kind: 'invalid' });

    stub.result = () => throwError(() => new ProblemError(aProblem(500, 'INTERNAL_ERROR')));
    facade.type('mercadooo');
    wait();
    expect(facade.state()).toMatchObject({ status: 'error', kind: 'generic' });
  });

  it('Dado erro, então "tentar de novo" repete o último termo sem esperar a pausa', () => {
    const stub = new SearchGatewayStub();
    stub.result = () => throwError(() => new ProblemError(aProblem(0, 'NETWORK')));
    const { facade } = setup(stub);
    facade.type('mercado');
    wait();
    expect(facade.state().status).toBe('error');

    stub.result = (q) => of(aSearchResults({ q }));
    facade.retry();

    expect(stub.queries).toEqual(['mercado', 'mercado']);
    expect(facade.state().status).toBe('ready');
  });

  it('Dado o resultado, então repassa os campos e os "truncated" como vieram', () => {
    const stub = new SearchGatewayStub();
    stub.result = (q) => of(aSearchResults({ q, truncated: ['notes'] }));
    const { facade } = setup(stub);

    facade.type('mercado');
    wait();

    const data = facade.data();
    expect(data?.truncated).toEqual(['notes']);
    expect(data?.transactions[0]?.amount.amount).toBe('87.30');
  });
});
