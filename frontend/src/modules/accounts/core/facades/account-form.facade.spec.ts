import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { AccountFormFacade } from '~/modules/accounts/core/facades/account-form.facade';
import type { Account } from '~/modules/accounts/core/types/account';
import type { AccountInput } from '~/modules/accounts/core/types/account-input';
import {
  AccountsGatewayStub,
  aProblem,
  anAccount,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';

const input: AccountInput = {
  name: 'Carteira',
  type: 'WALLET',
  institution: null,
  openingBalance: '0.00',
  openingDate: '2026-10-04',
};

function setup(gateway = new AccountsGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideAccountsStub(gateway), AccountFormFacade] });
  return { gateway, facade: TestBed.inject(AccountFormFacade) };
}

describe('AccountFormFacade', () => {
  it('Dado create, então envia, emite a conta devolvida pela API e termina de salvar', () => {
    const { gateway, facade } = setup();
    const saved: Account[] = [];
    facade.saved$.subscribe((account) => saved.push(account));

    facade.save({ kind: 'create', input });

    expect(gateway.calls).toEqual(['create:Carteira']);
    expect(saved).toEqual([anAccount({ name: 'Carteira', type: 'WALLET' })]);
    expect(facade.saving()).toBe(false);
    expect(facade.problem()).toBeNull();
  });

  it('Dado update, então leva a version e emite o recurso da resposta', () => {
    const { gateway, facade } = setup();
    const saved: Account[] = [];
    facade.saved$.subscribe((account) => saved.push(account));

    facade.save({
      kind: 'update',
      id: 'acc-1',
      input: { name: 'Nu', institution: null, version: 3 },
    });

    expect(gateway.calls).toEqual(['update:acc-1:3']);
    expect(saved[0]).toMatchObject({ name: 'Nu', version: 4 });
  });

  it('Dado clique duplo no salvar, então uma requisição só (exhaustMap)', () => {
    const gateway = new AccountsGatewayStub();
    const pending = new Subject<Account>();
    gateway.next = pending;
    const { facade } = setup(gateway);

    facade.save({ kind: 'create', input });
    facade.save({ kind: 'create', input });

    expect(gateway.calls).toHaveLength(1);
    expect(facade.saving()).toBe(true);
    pending.next(anAccount());
    pending.complete();
    expect(facade.saving()).toBe(false);
  });

  it('Dado 422/409/400, então expõe a falha tipada com code e fieldErrors e não emite "saved"', () => {
    const gateway = new AccountsGatewayStub();
    const fieldErrors = [{ field: 'name', code: 'NOT_BLANK', message: 'x' }];
    gateway.next = failWith(400, 'VALIDATION_FAILED', fieldErrors);
    const { facade } = setup(gateway);
    let emitted = 0;
    facade.saved$.subscribe(() => emitted++);

    facade.save({ kind: 'create', input });

    expect(facade.problem()).toEqual(aProblem(400, 'VALIDATION_FAILED', fieldErrors));
    expect(emitted).toBe(0);
    expect(facade.saving()).toBe(false);
  });

  it('Dado um novo envio depois de uma falha, então a falha antiga é limpa', () => {
    const gateway = new AccountsGatewayStub();
    gateway.next = failWith(409, 'VERSION_CONFLICT');
    const { facade } = setup(gateway);
    facade.save({ kind: 'create', input });
    expect(facade.problem()?.code).toBe('VERSION_CONFLICT');

    gateway.next = null;
    facade.save({ kind: 'create', input });

    expect(facade.problem()).toBeNull();
  });

  it('Dado load, então expõe a conta; com 404, expõe o erro', () => {
    const gateway = new AccountsGatewayStub();
    const { facade } = setup(gateway);

    facade.load('acc-9');
    expect(facade.account()).toMatchObject({ id: 'acc-9' });

    gateway.getResult = failWith(404, 'ACCOUNT_NOT_FOUND');
    facade.load('acc-x');
    const state = facade.loadStatus();
    expect(state.status === 'error' && state.problem.code).toBe('ACCOUNT_NOT_FOUND');
  });
});
