import { Component } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Subject, throwError } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { LoginPage } from '~/app/features/login/pages/login.page';
import { AuthFailure } from '~/modules/auth/core/types/auth-failure';
import type { AuthToken } from '~/modules/auth/core/types/auth-token';
import { aToken, AuthGatewayStub, provideAuthStub } from '~/testing/auth-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

async function setup(returnUrl?: string, gateway = new AuthGatewayStub()) {
  const result = await render(LoginPage, {
    inputs: { returnUrl },
    providers: [
      provideI18nTesting('pt'),
      provideAuthStub(gateway),
      provideRouter([
        { path: 'transactions', component: DummyComponent },
        { path: '', component: DummyComponent },
      ]),
    ],
  });
  const email = screen.getByTestId('login-email') as HTMLInputElement;
  const password = screen.getByTestId('login-password') as HTMLInputElement;
  return {
    ...result,
    gateway,
    email,
    password,
    router: result.fixture.debugElement.injector.get(Router),
  };
}

async function fillAndSubmit(
  email: HTMLElement,
  password: HTMLElement,
  mail = 'dono@moneylog.app',
) {
  await userEvent.type(email, mail);
  await userEvent.type(password, 'segredo');
  await userEvent.click(screen.getByTestId('login-submit'));
}

describe('LoginPage', () => {
  it('Dado credenciais certas e um returnUrl interno, quando entro, então navega para o returnUrl', async () => {
    const { email, password, gateway, router, fixture } = await setup('/transactions');

    await fillAndSubmit(email, password);
    await fixture.whenStable();

    expect(gateway.logins).toEqual([{ email: 'dono@moneylog.app', password: 'segredo' }]);
    expect(router.url).toBe('/transactions');
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it.each(['https://evil.example', '//evil.example', 'javascript:alert(1)', undefined])(
    'Dado o returnUrl %s, quando entro, então vai para /',
    async (returnUrl) => {
      const { email, password, router, fixture } = await setup(returnUrl);

      await fillAndSubmit(email, password);
      await fixture.whenStable();

      expect(router.url).toBe('/');
    },
  );

  it('Dado credenciais erradas, então mostra "E-mail ou senha incorretos" e mantém o e-mail digitado', async () => {
    const gateway = new AuthGatewayStub();
    gateway.login$ = throwError(() => new AuthFailure('invalid_credentials'));
    const { email, password } = await setup(undefined, gateway);

    await fillAndSubmit(email, password, 'errado@moneylog.app');

    expect(screen.getByTestId('login-error')).toHaveTextContent(pt.auth.login.errors.invalid);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(email.value).toBe('errado@moneylog.app');
  });

  it('Dado 429 com Retry-After de 541 s, então mostra a espera em minutos (arredondada para cima)', async () => {
    const gateway = new AuthGatewayStub();
    gateway.login$ = throwError(() => new AuthFailure('rate_limited', 541));
    const { email, password } = await setup(undefined, gateway);

    await fillAndSubmit(email, password);

    expect(screen.getByTestId('login-error')).toHaveTextContent(
      'Muitas tentativas. Tente de novo em 10 min.',
    );
  });

  it.each([
    ['network', pt.auth.login.errors.network],
    ['unavailable', pt.auth.login.errors.unavailable],
  ] as const)(
    'Dado falha "%s", então mostra a mensagem correspondente',
    async (reason, message) => {
      const gateway = new AuthGatewayStub();
      gateway.login$ = throwError(() => new AuthFailure(reason));
      const { email, password } = await setup(undefined, gateway);

      await fillAndSubmit(email, password);

      expect(screen.getByTestId('login-error')).toHaveTextContent(message);
    },
  );

  it('Dado clique duplo no "Entrar", então só uma requisição sai e o botão fica ocupado', async () => {
    const gateway = new AuthGatewayStub();
    const pending = new Subject<AuthToken>();
    gateway.login$ = pending;
    const { email, password, fixture } = await setup(undefined, gateway);
    await userEvent.type(email, 'dono@moneylog.app');
    await userEvent.type(password, 'segredo');

    await userEvent.dblClick(screen.getByTestId('login-submit'));
    fixture.detectChanges();

    expect(gateway.logins).toHaveLength(1);
    expect(screen.getByTestId('login-submit')).toBeDisabled();
    expect(screen.getByTestId('login-submit')).toHaveTextContent(pt.auth.login.submitting);

    pending.next(aToken());
    pending.complete();
  });

  it('Dado o formulário vazio, quando envio, então mostra os erros dos campos e não chama a API', async () => {
    const { gateway, fixture } = await setup();

    await userEvent.click(screen.getByTestId('login-submit'));
    fixture.detectChanges();

    expect(gateway.logins).toHaveLength(0);
    expect(screen.getAllByText(pt.form.errors.required)).toHaveLength(2);
  });

  it('Dado e-mail em formato inválido, então não envia', async () => {
    const { email, password, gateway, fixture } = await setup();

    await fillAndSubmit(email, password, 'isto-nao-e-email');
    fixture.detectChanges();

    expect(gateway.logins).toHaveLength(0);
    expect(screen.getByText(pt.form.errors.invalid)).toBeInTheDocument();
  });

  it('Dado a página, então o único h1 é "Entrar", a senha é password e o axe não aponta violações', async () => {
    const { container, password } = await setup();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(pt.auth.login.title);
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
