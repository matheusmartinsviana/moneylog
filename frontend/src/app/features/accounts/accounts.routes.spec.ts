import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { tap } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import routes from '~/app/features/accounts/accounts.routes';
import { AccountsGatewayStub, anAccount, provideAccountsStub } from '~/testing/accounts-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

describe('accounts.routes (cadastro em modal)', () => {
  async function open(url: string, gateway = new AccountsGatewayStub()) {
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting('pt'),
        provideAccountsStub(gateway),
        provideRouter([{ path: 'accounts', children: routes }]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
    return { harness, gateway };
  }

  it('Dado o deep link /accounts/new, então abre a lista com o modal de nova conta por cima', async () => {
    await open('/accounts/new');

    expect(await screen.findByTestId('accounts-add')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: pt.accounts.form.createTitle })).toBeInTheDocument();
  });

  it('Dado o modal aberto, quando salvo, então fecha, mostra a conta nova na lista e avisa', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [anAccount({ id: 'a', name: 'Nubank' })];
    const create = gateway.create.bind(gateway);
    gateway.create = (input) =>
      create(input).pipe(tap((account) => (gateway.accounts = [...gateway.accounts, account])));
    const { harness } = await open('/accounts', gateway);

    await userEvent.click(await screen.findByTestId('accounts-add'));
    harness.detectChanges();
    await userEvent.type(screen.getByTestId('account-name'), 'Cofre');
    await userEvent.click(screen.getByTestId('account-form-save'));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/accounts');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Cofre')).toBeInTheDocument();
  });
});
