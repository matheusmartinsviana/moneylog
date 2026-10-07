import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { PeopleGateway } from '~/modules/people/core/interfaces/people.gateway';
import { PEOPLE_ENDPOINTS } from '~/modules/people/infra/endpoints';
import { PeopleRequestsFacade } from '~/modules/people/infra/facades/people-requests.facade';
import { providePeople } from '~/modules/people/infra/people.providers';
import {
  aDebtSummaryResponse,
  aPersonDetailResponse,
  aPersonResponse,
  brl,
} from '~/testing/etapa4-response-testing';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      providePeople(),
    ],
  });
  return { gateway: TestBed.inject(PeopleGateway), http: TestBed.inject(HttpTestingController) };
}

describe('PeopleRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o bootstrap, então a porta PeopleGateway é a facade de requisições', () => {
    const { gateway } = setup(true);
    expect(gateway).toBe(TestBed.inject(PeopleRequestsFacade));
  });

  describe('em modo mock', () => {
    it('Dado o mock, então a lista vem vazia e nenhuma requisição sai', async () => {
      const { gateway, http } = setup(true);

      expect(await firstValueFrom(gateway.list({ page: 1, pageSize: 10 }))).toEqual({
        items: [],
        hasNext: false,
      });
      http.expectNone(() => true);
    });

    it('Dado o mock, então pessoa por id e as ações dão 404 sem requisição', async () => {
      const { gateway, http } = setup(true);

      await expect(firstValueFrom(gateway.get('x'))).rejects.toMatchObject({
        problem: { status: 404, code: 'PERSON_NOT_FOUND' },
      });
      await expect(firstValueFrom(gateway.archive('x'))).rejects.toMatchObject({
        problem: { code: 'PERSON_NOT_FOUND' },
      });
      http.expectNone(() => true);
    });

    it('Dado o mock, então criar devolve a pessoa como o backend a devolveria', async () => {
      const { gateway, http } = setup(true);

      const person = await firstValueFrom(gateway.create({ name: ' Maria ', notes: null }, 'k'));

      expect(person).toMatchObject({ name: 'Maria', archived: false, direction: 'NONE' });
      expect(person.net.amount).toBe('0.00');
      http.expectNone(() => true);
    });
  });

  describe('em modo real', () => {
    it('Dado a lista, então pede status, busca, página e tamanho', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.list({ status: 'ARCHIVED', q: ' joão ', page: 2, pageSize: 50 }),
      );
      const req = http.expectOne((r) => r.url === PEOPLE_ENDPOINTS.collection);
      expect(req.request.params.get('status')).toBe('ARCHIVED');
      expect(req.request.params.get('q')).toBe('joão');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('50');
      req.flush({ items: [aPersonResponse()], hasNext: true });

      const slice = await result;
      expect(slice.hasNext).toBe(true);
      expect(slice.items[0]).toMatchObject({ name: 'João', direction: 'RECEIVABLE' });
      // O saldo é a string da API, sem conversão.
      expect(slice.items[0]?.net).toEqual({ amount: '150.00', currency: 'BRL' });
    });

    it('Dado busca vazia, então não manda `q`', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.list({ q: '  ', page: 1, pageSize: 10 }));
      const req = http.expectOne((r) => r.url === PEOPLE_ENDPOINTS.collection);
      expect(req.request.params.has('q')).toBe(false);
      req.flush({ items: [], hasNext: false });
      await result;
    });

    it('Dado o detalhe, então mapeia as dívidas resumidas com os valores do backend', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.get('person-1'));
      http.expectOne(PEOPLE_ENDPOINTS.item('person-1')).flush(
        aPersonDetailResponse({
          debts: [aDebtSummaryResponse({ outstanding: brl('77.77') })],
        }),
      );

      const person = await result;
      expect(person.debts[0]?.outstanding.amount).toBe('77.77');
      expect(person.debts[0]?.person.name).toBe('João');
    });

    it('Dado criar e editar, então os corpos levam nome sem espaços, notas vazias como null e a version', async () => {
      const { gateway, http } = setup(false);

      const created = firstValueFrom(gateway.create({ name: ' João ', notes: '   ' }, 'key-p'));
      const post = http.expectOne(PEOPLE_ENDPOINTS.collection);
      expect(post.request.method).toBe('POST');
      expect(post.request.headers.get('Idempotency-Key')).toBe('key-p');
      expect(post.request.body).toEqual({ name: 'João', notes: null });
      post.flush(aPersonResponse());
      await created;

      const updated = firstValueFrom(
        gateway.update('person-1', { name: 'João', notes: 'colega', version: 4 }),
      );
      const put = http.expectOne(PEOPLE_ENDPOINTS.item('person-1'));
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ name: 'João', notes: 'colega', version: 4 });
      put.flush(aPersonResponse({ version: 5 }));
      expect((await updated).version).toBe(5);
    });

    it('Dado arquivar e desarquivar, então são POST sem corpo e devolvem a pessoa', async () => {
      const { gateway, http } = setup(false);

      const archived = firstValueFrom(gateway.archive('person-1'));
      const req = http.expectOne(PEOPLE_ENDPOINTS.archive('person-1'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      req.flush(aPersonResponse({ archived: true }));
      expect((await archived).archived).toBe(true);

      const back = firstValueFrom(gateway.unarchive('person-1'));
      http.expectOne(PEOPLE_ENDPOINTS.unarchive('person-1')).flush(aPersonResponse());
      expect((await back).archived).toBe(false);
    });

    it('Dado 422 PERSON_ARCHIVED, então a falha chega tipada, com o code do contrato', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.archive('person-1'));
      http
        .expectOne(PEOPLE_ENDPOINTS.archive('person-1'))
        .flush(
          { code: 'PERSON_ALREADY_ARCHIVED', errors: [] },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      await expect(result).rejects.toMatchObject({
        problem: { status: 422, code: 'PERSON_ALREADY_ARCHIVED' },
      });
    });
  });
});
