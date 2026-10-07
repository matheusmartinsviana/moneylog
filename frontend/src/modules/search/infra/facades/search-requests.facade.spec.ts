import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { SearchGateway } from '~/modules/search/core/interfaces/search.gateway';
import { SEARCH_ENDPOINTS } from '~/modules/search/infra/endpoints';
import { SearchRequestsFacade } from '~/modules/search/infra/facades/search-requests.facade';
import { provideSearch } from '~/modules/search/infra/search.providers';
import { aSearchResultsResponse } from '~/testing/reports-testing';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideSearch(),
    ],
  });
  return { gateway: TestBed.inject(SearchGateway), http: TestBed.inject(HttpTestingController) };
}

describe('SearchRequestsFacade', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    delete (globalThis as Record<string, unknown>)['__MONEYLOG_MOCK_RESPONSES__'];
  });

  it('Dado o bootstrap, então a porta é a facade de requisições', () => {
    const { gateway } = setup(false);
    expect(gateway).toBe(TestBed.inject(SearchRequestsFacade));
  });

  it('Dado o termo, então pede /v1/search?q= (escapado) e copia os cinco grupos e o truncated', async () => {
    const { gateway, http } = setup(false);

    const result = firstValueFrom(gateway.search('pão & café'));
    const request = http.expectOne((r) => r.url === SEARCH_ENDPOINTS.search);
    expect(request.request.params.get('q')).toBe('pão & café');
    expect(request.request.urlWithParams).toContain('q=p%C3%A3o%20%26%20caf%C3%A9');
    request.flush(aSearchResultsResponse({ truncated: ['notes'] }));

    const data = await result;
    expect(data.transactions[0]).toMatchObject({
      description: 'Mercado do bairro',
      amount: { amount: '87.30', currency: 'BRL' },
      category: { name: 'Alimentação' },
      account: { name: 'Nubank' },
    });
    expect(data.accounts[0]).toMatchObject({ status: 'ARCHIVED' });
    expect(data.categories[0]).toMatchObject({ archived: false });
    expect(data.cards[0]).toMatchObject({ institution: null });
    // O snippet é texto puro: a facade não o converte nem o limpa (a tela o interpola, escapado).
    expect(data.notes[0]?.snippet).toBe(
      '<b>Comprar</b> leite **e** pão <img src=x onerror=alert(1)>',
    );
    expect(data.truncated).toEqual(['notes']);
  });

  it('Dado 400 SEARCH_QUERY_INVALID e 429 com Retry-After, então falha com o Problem', async () => {
    const { gateway, http } = setup(false);

    const invalid = firstValueFrom(gateway.search('ab'));
    http
      .expectOne((r) => r.url === SEARCH_ENDPOINTS.search)
      .flush({ code: 'SEARCH_QUERY_INVALID' }, { status: 400, statusText: 'Bad' });
    await expect(invalid).rejects.toMatchObject({
      problem: { status: 400, code: 'SEARCH_QUERY_INVALID' },
    });

    const limited = firstValueFrom(gateway.search('abc'));
    http
      .expectOne((r) => r.url === SEARCH_ENDPOINTS.search)
      .flush(
        { code: 'TOO_MANY_ATTEMPTS' },
        { status: 429, statusText: 'Too Many', headers: { 'Retry-After': '12' } },
      );
    await expect(limited).rejects.toMatchObject({
      problem: { status: 429, retryAfterSeconds: 12 },
    });
  });

  it('Dado o mock, então não há resultado nem requisição; com a resposta do E2E, usa o JSON bruto', async () => {
    const { gateway, http } = setup(true);

    const none = await firstValueFrom(gateway.search('mercado'));
    expect(none).toMatchObject({ q: 'mercado', transactions: [], notes: [], truncated: [] });

    (globalThis as Record<string, unknown>)['__MONEYLOG_MOCK_RESPONSES__'] = {
      '/v1/search': aSearchResultsResponse(),
    };
    const some = await firstValueFrom(gateway.search('mercado'));
    expect(some.transactions).toHaveLength(1);
    http.expectNone(() => true);
  });
});
