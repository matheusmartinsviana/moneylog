import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import { AccountsGateway } from '~/modules/accounts/core/interfaces/accounts.gateway';
import { provideAccounts } from '~/modules/accounts/infra/accounts.providers';
import { ACCOUNTS_ENDPOINTS } from '~/modules/accounts/infra/endpoints';
import { AccountsRequestsFacade } from '~/modules/accounts/infra/facades/accounts-requests.facade';
import type { AccountResponse } from '~/modules/accounts/infra/responses/account.response';
import { API_MOCKS } from '~/util/api-mocks';

function setup(useMocks: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_MOCKS, useValue: useMocks },
      provideAccounts(),
      AccountsListFacade,
    ],
  });
  return { gateway: TestBed.inject(AccountsGateway), http: TestBed.inject(HttpTestingController) };
}

function response(id: string, overrides: Partial<AccountResponse> = {}): AccountResponse {
  return {
    id,
    name: `Conta ${id}`,
    type: 'CHECKING',
    liquidity: 'CASH',
    institution: null,
    openingBalance: { amount: '10.00', currency: 'BRL' },
    openingDate: '2026-01-01',
    currentBalance: { amount: '12.34', currency: 'BRL' },
    status: 'ACTIVE',
    openingEditable: true,
    archivable: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('AccountsRequestsFacade', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Dado o bootstrap, então a porta AccountsGateway é a facade de requisições', () => {
    const { gateway } = setup(true);
    expect(gateway).toBe(TestBed.inject(AccountsRequestsFacade));
  });

  describe('em modo mock', () => {
    it('Dado o mock, então a lista vem vazia e nenhuma requisição sai', async () => {
      const { gateway, http } = setup(true);

      const slice = await firstValueFrom(gateway.list({ page: 1, pageSize: 10 }));

      expect(slice).toEqual({ items: [], hasNext: false });
      http.expectNone(() => true);
    });

    it('Dado o mock, então buscar, editar e arquivar uma conta dá 404 sem requisição', async () => {
      const { gateway, http } = setup(true);

      await expect(firstValueFrom(gateway.get('x'))).rejects.toMatchObject({
        problem: { status: 404, code: 'ACCOUNT_NOT_FOUND' },
      });
      await expect(firstValueFrom(gateway.archive('x'))).rejects.toMatchObject({
        problem: { code: 'ACCOUNT_NOT_FOUND' },
      });
      await expect(
        firstValueFrom(gateway.update('x', { name: 'a', institution: null, version: 0 })),
      ).rejects.toMatchObject({ problem: { code: 'ACCOUNT_NOT_FOUND' } });
      http.expectNone(() => true);
    });

    it('Dado o mock, então criar devolve a conta como o backend a devolveria', async () => {
      const { gateway } = setup(true);

      const account = await firstValueFrom(
        gateway.create({
          name: 'Poupança',
          type: 'SAVINGS',
          institution: null,
          openingBalance: '5.00',
          openingDate: '2026-10-04',
        }),
      );

      expect(account).toMatchObject({ name: 'Poupança', liquidity: 'CASH', status: 'ACTIVE' });
    });
  });

  describe('com a API', () => {
    it('Dado a lista, então GET /v1/accounts com status, page e pageSize e mapeia sem recalcular', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.list({ status: 'ACTIVE', page: 2, pageSize: 50 }));
      const req = http.expectOne((r) => r.url === ACCOUNTS_ENDPOINTS.collection);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('status')).toBe('ACTIVE');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('50');
      req.flush({ items: [response('a')], hasNext: true });

      const slice = await result;
      expect(slice.hasNext).toBe(true);
      expect(slice.items[0]).toEqual({
        id: 'a',
        name: 'Conta a',
        type: 'CHECKING',
        liquidity: 'CASH',
        institution: null,
        openingBalance: { amount: '10.00', currency: 'BRL' },
        openingDate: '2026-01-01',
        currentBalance: { amount: '12.34', currency: 'BRL' },
        status: 'ACTIVE',
        openingEditable: true,
        archivable: false,
        reservedAmount: { amount: '0.00', currency: 'BRL' },
        uncovered: false,
        version: 1,
      });
    });

    it('Dado reservedAmount e uncovered da Etapa 5, então copia o que o backend calculou (sem recalcular)', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.list({ page: 1, pageSize: 10 }));
      http
        .expectOne((r) => r.url === ACCOUNTS_ENDPOINTS.collection)
        .flush({
          items: [
            response('a', {
              reservedAmount: { amount: '25000.00', currency: 'BRL' },
              uncovered: true,
            }),
          ],
          hasNext: false,
        });

      const [account] = (await result).items;
      expect(account?.reservedAmount).toEqual({ amount: '25000.00', currency: 'BRL' });
      expect(account?.uncovered).toBe(true);
    });

    it('Dado a lista sem filtro, então não manda status (todas)', () => {
      const { gateway, http } = setup(false);

      gateway.list({ page: 1, pageSize: 10 }).subscribe();

      const req = http.expectOne((r) => r.url === ACCOUNTS_ENDPOINTS.collection);
      expect(req.request.params.has('status')).toBe(false);
      req.flush({ items: [], hasNext: false });
    });

    it('Dado 11 contas em 2 páginas, quando chamo loadAll, então pede pageSize=50, segue até hasNext=false e devolve as 11 (S-91)', async () => {
      const { http } = setup(false);
      const facade = TestBed.inject(AccountsListFacade);

      const result = firstValueFrom(facade.loadAll('ACTIVE'));
      const first = http.expectOne((r) => r.url === ACCOUNTS_ENDPOINTS.collection);
      expect(first.request.params.get('pageSize')).toBe('50');
      expect(first.request.params.get('page')).toBe('1');
      first.flush({
        items: Array.from({ length: 10 }, (_, i) => response(`a${i}`)),
        hasNext: true,
      });
      const second = http.expectOne((r) => r.url === ACCOUNTS_ENDPOINTS.collection);
      expect(second.request.params.get('page')).toBe('2');
      expect(second.request.params.get('pageSize')).toBe('50');
      second.flush({ items: [response('a10')], hasNext: false });

      expect((await result).map((a) => a.id)).toEqual([
        ...Array.from({ length: 10 }, (_, i) => `a${i}`),
        'a10',
      ]);
    });

    it('Dado create, então POST com o saldo inicial em Money BRL e devolve o recurso', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.create({
          name: 'Nubank',
          type: 'CHECKING',
          institution: 'Nubank',
          openingBalance: '-50.00',
          openingDate: '2026-10-04',
        }),
      );
      const req = http.expectOne(ACCOUNTS_ENDPOINTS.collection);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        name: 'Nubank',
        type: 'CHECKING',
        institution: 'Nubank',
        openingBalance: { amount: '-50.00', currency: 'BRL' },
        openingDate: '2026-10-04',
      });
      req.flush(response('new'), { status: 201, statusText: 'Created' });

      expect((await result).id).toBe('new');
    });

    it('Dado update com a abertura travada, então o PUT leva só nome, instituição e version', () => {
      const { gateway, http } = setup(false);

      gateway.update('a', { name: 'Novo', institution: null, version: 7 }).subscribe();

      const req = http.expectOne(ACCOUNTS_ENDPOINTS.item('a'));
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ name: 'Novo', institution: null, version: 7 });
      req.flush(response('a'));
    });

    it('Dado update com a abertura editável, então o PUT leva tipo, saldo e data', () => {
      const { gateway, http } = setup(false);

      gateway
        .update('a', {
          name: 'Novo',
          institution: 'X',
          type: 'SAVINGS',
          openingBalance: '3.00',
          openingDate: '2026-02-02',
          version: 1,
        })
        .subscribe();

      const req = http.expectOne(ACCOUNTS_ENDPOINTS.item('a'));
      expect(req.request.body).toMatchObject({
        type: 'SAVINGS',
        openingBalance: { amount: '3.00', currency: 'BRL' },
        openingDate: '2026-02-02',
      });
      req.flush(response('a'));
    });

    it('Dado archive e unarchive, então POST nas rotas de ação e devolve o recurso', async () => {
      const { gateway, http } = setup(false);

      const archived = firstValueFrom(gateway.archive('a'));
      http.expectOne(ACCOUNTS_ENDPOINTS.archive('a')).flush(response('a', { status: 'ARCHIVED' }));
      const active = firstValueFrom(gateway.unarchive('a'));
      http.expectOne(ACCOUNTS_ENDPOINTS.unarchive('a')).flush(response('a'));

      expect((await archived).status).toBe('ARCHIVED');
      expect((await active).status).toBe('ACTIVE');
    });

    it('Dado 422 ACCOUNT_WITH_BALANCE_CANNOT_BE_ARCHIVED, então falha com o code tipado', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.archive('a'));
      http
        .expectOne(ACCOUNTS_ENDPOINTS.archive('a'))
        .flush(
          { code: 'ACCOUNT_WITH_BALANCE_CANNOT_BE_ARCHIVED', traceId: 't' },
          { status: 422, statusText: 'Unprocessable' },
        );

      await expect(result).rejects.toMatchObject({
        problem: { status: 422, code: 'ACCOUNT_WITH_BALANCE_CANNOT_BE_ARCHIVED' },
      });
    });

    it('Dado 409 VERSION_CONFLICT no update, então falha com o code tipado', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(
        gateway.update('a', { name: 'x', institution: null, version: 1 }),
      );
      http
        .expectOne(ACCOUNTS_ENDPOINTS.item('a'))
        .flush({ code: 'VERSION_CONFLICT' }, { status: 409, statusText: 'Conflict' });

      await expect(result).rejects.toMatchObject({ problem: { code: 'VERSION_CONFLICT' } });
    });

    it('Dado erro de rede, então falha com NETWORK', async () => {
      const { gateway, http } = setup(false);

      const result = firstValueFrom(gateway.get('a'));
      http.expectOne(ACCOUNTS_ENDPOINTS.item('a')).error(new ProgressEvent('error'));

      await expect(result).rejects.toMatchObject({ problem: { status: 0, code: 'NETWORK' } });
    });
  });
});
