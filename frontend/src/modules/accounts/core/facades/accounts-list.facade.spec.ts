import { TestBed } from '@angular/core/testing';
import { firstValueFrom, NEVER } from 'rxjs';

import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import {
  AccountsGatewayStub,
  aProblem,
  anAccount,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';

function setup(gateway = new AccountsGatewayStub()) {
  TestBed.configureTestingModule({
    providers: [provideAccountsStub(gateway), AccountsListFacade],
  });
  return { gateway, facade: TestBed.inject(AccountsListFacade) };
}

describe('AccountsListFacade', () => {
  it('Dado a carga em andamento, então expõe "loading" e nada mais', () => {
    const gateway = new AccountsGatewayStub();
    gateway.listError = NEVER as never;
    const { facade } = setup(gateway);

    facade.load('ACTIVE');

    expect(facade.loading()).toBe(true);
    expect(facade.data()).toBeNull();
    expect(facade.empty()).toBe(false);
  });

  it('Dado nenhuma conta, então expõe "empty"', () => {
    const { facade } = setup();

    facade.load('ACTIVE');

    expect(facade.empty()).toBe(true);
    expect(facade.state().status).toBe('empty');
  });

  it('Dado contas, então "data" traz saldo atual, openingEditable e archivable exatamente como recebidos', () => {
    const gateway = new AccountsGatewayStub();
    // O saldo não "fecha" com o inicial de propósito: o front não calcula.
    gateway.accounts = [
      anAccount({
        id: 'a',
        openingBalance: { amount: '10.00', currency: 'BRL' },
        currentBalance: { amount: '-7.77', currency: 'BRL' },
        openingEditable: true,
        archivable: true,
      }),
      anAccount({ id: 'b', openingEditable: false, archivable: false }),
    ];
    const { facade } = setup(gateway);

    facade.load('ACTIVE');

    const data = facade.data()!;
    expect(data.map((a) => a.id)).toEqual(['a', 'b']);
    expect(data[0]).toMatchObject({
      currentBalance: { amount: '-7.77', currency: 'BRL' },
      openingEditable: true,
      archivable: true,
    });
    expect(data[1]).toMatchObject({ openingEditable: false, archivable: false });
  });

  it('Dado erro, então expõe "error" com o Problem tipado e o "tentar de novo" recarrega', () => {
    const gateway = new AccountsGatewayStub();
    gateway.listError = failWith(500, 'INTERNAL_ERROR');
    const { facade } = setup(gateway);

    facade.load('ACTIVE');
    expect(facade.error()).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });

    gateway.listError = null;
    gateway.accounts = [anAccount()];
    facade.load('ACTIVE');
    expect(facade.data()).toHaveLength(1);
    expect(facade.error()).toBeNull();
  });

  it('Dado "archive", então devolve o recurso da resposta, e a conta sai da aba de ativas', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [anAccount({ id: 'a' }), anAccount({ id: 'b', name: 'Itaú' })];
    const { facade } = setup(gateway);
    facade.load('ACTIVE');

    const archived = await firstValueFrom(facade.archive('a'));

    expect(archived).toMatchObject({ id: 'a', status: 'ARCHIVED' });
    expect(facade.data()!.map((a) => a.id)).toEqual(['b']);
  });

  it('Dado "archive" da última conta ativa, então a lista fica vazia', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [anAccount({ id: 'a' })];
    const { facade } = setup(gateway);
    facade.load('ACTIVE');

    await firstValueFrom(facade.archive('a'));

    expect(facade.empty()).toBe(true);
  });

  it('Dado "unarchive" na aba de arquivadas, então a conta volta para as ativas (sai da aba)', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [anAccount({ id: 'a', status: 'ARCHIVED' })];
    const { facade } = setup(gateway);
    facade.load('ARCHIVED');

    const account = await firstValueFrom(facade.unarchive('a'));

    expect(account.status).toBe('ACTIVE');
    expect(facade.empty()).toBe(true);
  });

  it('Dado todas as contas (sem filtro), então "archive" troca a conta pelo recurso da resposta', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [anAccount({ id: 'a' }), anAccount({ id: 'b', name: 'Itaú' })];
    const { facade } = setup(gateway);
    facade.load();

    await firstValueFrom(facade.archive('a'));

    expect(facade.data()!.map((a) => `${a.id}:${a.status}`)).toEqual(['a:ARCHIVED', 'b:ACTIVE']);
  });

  it('Dado ACCOUNT_WITH_BALANCE_CANNOT_BE_ARCHIVED, então "archive" falha com o code tipado e a lista não muda', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [anAccount({ id: 'a' })];
    gateway.next = failWith(422, 'ACCOUNT_WITH_BALANCE_CANNOT_BE_ARCHIVED');
    const { facade } = setup(gateway);
    facade.load('ACTIVE');

    await expect(firstValueFrom(facade.archive('a'))).rejects.toMatchObject({
      problem: aProblem(422, 'ACCOUNT_WITH_BALANCE_CANNOT_BE_ARCHIVED'),
    });
    expect(facade.data()).toHaveLength(1);
  });

  it('Dado 11 contas no gateway, quando chamo loadAll, então pede pageSize=50 e devolve as 11', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = Array.from({ length: 11 }, (_, i) =>
      anAccount({ id: `a${i}`, name: `C${i}` }),
    );
    const { facade } = setup(gateway);

    const all = await firstValueFrom(facade.loadAll('ACTIVE'));

    expect(all).toHaveLength(11);
    expect(gateway.queries).toEqual([{ status: 'ACTIVE', page: 1, pageSize: 50 }]);
  });

  it('Dado 120 contas, então loadAll continua pedindo páginas até hasNext=false', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = Array.from({ length: 120 }, (_, i) => anAccount({ id: `a${i}` }));
    const { facade } = setup(gateway);

    const all = await firstValueFrom(facade.loadAll());

    expect(all).toHaveLength(120);
    expect(gateway.queries.map((q) => q.page)).toEqual([1, 2, 3]);
    expect(gateway.queries.every((q) => q.pageSize === 50)).toBe(true);
  });
});
