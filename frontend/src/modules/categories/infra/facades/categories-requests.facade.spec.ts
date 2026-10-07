import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { CategoriesGateway } from '~/modules/categories/core/interfaces/categories.gateway';
import { provideCategories } from '~/modules/categories/infra/categories.providers';
import { CATEGORIES_ENDPOINTS } from '~/modules/categories/infra/endpoints';
import { CategoriesRequestsFacade } from '~/modules/categories/infra/facades/categories-requests.facade';
import type { CategoryResponse } from '~/modules/categories/infra/responses/category.response';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideCategories(),
    ],
  });
  return {
    gateway: TestBed.inject(CategoriesGateway),
    http: TestBed.inject(HttpTestingController),
  };
}

const category = (overrides: Partial<CategoryResponse> = {}): CategoryResponse => ({
  id: 'c1',
  name: 'Alimentação',
  kind: 'EXPENSE',
  system: true,
  archived: false,
  version: 2,
  ...overrides,
});

describe('CategoriesRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o bootstrap, então a porta é a facade de requisições', () => {
    const { gateway } = setup(true);
    expect(gateway).toBe(TestBed.inject(CategoriesRequestsFacade));
  });

  describe('em modo mock', () => {
    it('Dado o mock, então a lista vem vazia sem requisição', async () => {
      const { gateway, http } = setup(true);

      expect(
        await firstValueFrom(gateway.list({ kind: 'EXPENSE', includeArchived: false })),
      ).toEqual([]);
      http.expectNone(() => true);
    });

    it('Dado o mock, então criar devolve a categoria e as ações por id dão 404', async () => {
      const { gateway, http } = setup(true);

      expect(await firstValueFrom(gateway.create({ name: 'Pets', kind: 'EXPENSE' }))).toMatchObject(
        {
          name: 'Pets',
          system: false,
        },
      );
      await expect(firstValueFrom(gateway.archive('x'))).rejects.toMatchObject({
        problem: { code: 'CATEGORY_NOT_FOUND' },
      });
      await expect(
        firstValueFrom(gateway.rename('x', { name: 'a', version: 0 })),
      ).rejects.toMatchObject({ problem: { code: 'CATEGORY_NOT_FOUND' } });
      http.expectNone(() => true);
    });
  });

  describe('com a API', () => {
    it('Dado a lista, então GET /v1/categories com kind e includeArchived', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.list({ kind: 'INCOME', includeArchived: true }));
      const req = http.expectOne((r) => r.url === CATEGORIES_ENDPOINTS.collection);
      expect(req.request.params.get('kind')).toBe('INCOME');
      expect(req.request.params.get('includeArchived')).toBe('true');
      req.flush([category({ kind: 'INCOME' })]);

      expect(await result).toEqual([
        {
          id: 'c1',
          name: 'Alimentação',
          kind: 'INCOME',
          system: true,
          archived: false,
          version: 2,
        },
      ]);
    });

    it('Dado a lista sem kind, então não manda kind', () => {
      const { gateway, http } = setup(false);

      gateway.list({ includeArchived: false }).subscribe();

      const req = http.expectOne((r) => r.url === CATEGORIES_ENDPOINTS.collection);
      expect(req.request.params.has('kind')).toBe(false);
      req.flush([]);
    });

    it('Dado criar, então POST com nome e kind', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.create({ name: 'Pets', kind: 'EXPENSE' }));
      const req = http.expectOne(CATEGORIES_ENDPOINTS.collection);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Pets', kind: 'EXPENSE' });
      req.flush(category({ id: 'n', name: 'Pets', system: false }), {
        status: 201,
        statusText: 'Created',
      });

      expect((await result).id).toBe('n');
    });

    it('Dado renomear, então PUT com nome e version', () => {
      const { gateway, http } = setup(false);

      gateway.rename('c1', { name: 'Comida', version: 2 }).subscribe();

      const req = http.expectOne(CATEGORIES_ENDPOINTS.item('c1'));
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ name: 'Comida', version: 2 });
      req.flush(category());
    });

    it('Dado arquivar e desarquivar, então POST nas rotas de ação', async () => {
      const { gateway, http } = setup(false);

      const a = firstValueFrom(gateway.archive('c1'));
      http.expectOne(CATEGORIES_ENDPOINTS.archive('c1')).flush(category({ archived: true }));
      const b = firstValueFrom(gateway.unarchive('c1'));
      http.expectOne(CATEGORIES_ENDPOINTS.unarchive('c1')).flush(category());

      expect((await a).archived).toBe(true);
      expect((await b).archived).toBe(false);
    });

    it('Dado 409 CATEGORY_NAME_TAKEN, então falha com o code tipado', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.create({ name: 'Alimentação', kind: 'EXPENSE' }));
      http
        .expectOne(CATEGORIES_ENDPOINTS.collection)
        .flush({ code: 'CATEGORY_NAME_TAKEN' }, { status: 409, statusText: 'Conflict' });

      await expect(result).rejects.toMatchObject({
        problem: { status: 409, code: 'CATEGORY_NAME_TAKEN' },
      });
    });

    it('Dado erro de rede ao listar, então falha com NETWORK', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.list({ includeArchived: false }));
      http
        .expectOne((r) => r.url === CATEGORIES_ENDPOINTS.collection)
        .error(new ProgressEvent('error'));

      await expect(result).rejects.toMatchObject({ problem: { code: 'NETWORK' } });
    });
  });
});
