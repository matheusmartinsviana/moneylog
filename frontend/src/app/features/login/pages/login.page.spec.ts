import { Component } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, Subject, throwError } from 'rxjs';

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

describe('LoginPage: primeiro acesso', () => {
  const strong = 'uma-senha-bem-longa-123';

  async function fill(password = strong, confirm = password) {
    await userEvent.type(screen.getByTestId('setup-email'), 'dono@moneylog.app');
    await userEvent.type(screen.getByTestId('setup-code'), 'CODIGO-123');
    await userEvent.type(screen.getByTestId('setup-new-password'), password);
    await userEvent.type(screen.getByTestId('setup-confirm-password'), confirm);
    await userEvent.click(screen.getByTestId('setup-submit'));
  }

  async function render1(gateway = new AuthGatewayStub()) {
    gateway.setupRequired$ = of(true);
    const result = await render(LoginPage, {
      providers: [
        provideI18nTesting('pt'),
        provideAuthStub(gateway),
        provideRouter([{ path: '', component: DummyComponent }]),
      ],
    });
    return { gateway, ...result, router: result.fixture.debugElement.injector.get(Router) };
  }

  it('Dado passwordSetupRequired, então mostra "Primeiro acesso" com o foco no e-mail e a dica do código', async () => {
    const { fixture, container } = await render1();
    await fixture.whenStable();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(pt.auth.setup.title);
    expect(screen.queryByTestId('login-submit')).toBeNull();
    expect(screen.getByTestId('setup-email')).toHaveFocus();
    expect(screen.getByTestId('setup-code')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByTestId('setup-code')).not.toHaveAttribute('type', 'password');
    expect(screen.getByText(pt.auth.setup.codeHint)).toBeInTheDocument();
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado o setup, quando digito a senha, então as regras são marcadas ao vivo e o mostrar/ocultar alterna o tipo', async () => {
    await render1();
    const password = screen.getByTestId('setup-new-password');

    await userEvent.type(password, 'curta');
    expect(screen.getByTestId('setup-rule-length')).not.toHaveClass('login__rule--met');
    await userEvent.type(password, '-agora-fica-longa');
    expect(screen.getByTestId('setup-rule-length')).toHaveClass('login__rule--met');

    expect(password).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByTestId('setup-new-password-reveal'));
    expect(password).toHaveAttribute('type', 'text');
  });

  it('Dado dados válidos, quando envio, então chama setup-password e navega para o Início', async () => {
    const { gateway, router, fixture } = await render1();

    await fill();
    await fixture.whenStable();

    expect(gateway.setups).toEqual([
      { email: 'dono@moneylog.app', setupCode: 'CODIGO-123', newPassword: strong },
    ]);
    expect(router.url).toBe('/');
  });

  it('Dado senhas diferentes, quando envio, então avisa no campo e não chama a API', async () => {
    const { gateway, fixture } = await render1();

    await fill(strong, 'outra-senha-bem-longa');
    fixture.detectChanges();

    expect(gateway.setups).toHaveLength(0);
    expect(screen.getByText(pt.errors.codes['PASSWORD_MISMATCH']!)).toBeInTheDocument();
  });

  it('Dado INVALID_SETUP_CODE, então mostra a mensagem única sem detalhar', async () => {
    const gateway = new AuthGatewayStub();
    gateway.setup$ = throwError(() => new AuthFailure('invalid_setup_code'));
    const { fixture } = await render1(gateway);

    await fill();
    fixture.detectChanges();

    expect(screen.getByTestId('setup-error')).toHaveTextContent(pt.auth.setup.errors.invalidCode);
  });

  it('Dado WEAK_PASSWORD, então o erro aparece no campo da senha e o código digitado permanece', async () => {
    const gateway = new AuthGatewayStub();
    gateway.setup$ = throwError(() => new AuthFailure('weak_password'));
    const { fixture } = await render1(gateway);

    await fill();
    fixture.detectChanges();

    expect(screen.getByText(pt.errors.codes['WEAK_PASSWORD']!)).toBeInTheDocument();
    expect(screen.getByTestId('setup-code')).toHaveValue('CODIGO-123');
    expect(screen.getByTestId('setup-new-password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('Dado TOO_MANY_ATTEMPTS com Retry-After, então o botão fica desabilitado com a contagem', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const gateway = new AuthGatewayStub();
      gateway.setup$ = throwError(() => new AuthFailure('rate_limited', 30));
      const { fixture } = await render1(gateway);

      await fill();
      fixture.detectChanges();

      const submit = screen.getByTestId('setup-submit');
      expect(submit).toBeDisabled();
      expect(submit).toHaveTextContent('30 s');
      expect(screen.getByTestId('setup-error')).toHaveTextContent('30 s');

      await vi.advanceTimersByTimeAsync(31_000);
      fixture.detectChanges();
      expect(screen.getByTestId('setup-submit')).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['network', pt.auth.setup.errors.network],
    ['validation', pt.auth.setup.errors.validation],
    ['unavailable', pt.auth.setup.errors.unavailable],
  ] as const)('Dado a falha %s, então mostra a mensagem no alerta', async (reason, message) => {
    const gateway = new AuthGatewayStub();
    gateway.setup$ = throwError(() => new AuthFailure(reason));
    const { fixture } = await render1(gateway);

    await fill();
    fixture.detectChanges();

    expect(screen.getByTestId('setup-error')).toHaveTextContent(message);
  });

  it('Dado que o status falhou, então mostra o login normal com um aviso discreto', async () => {
    const gateway = new AuthGatewayStub();
    gateway.setupRequired$ = throwError(() => new AuthFailure('network'));
    await setup(undefined, gateway);

    expect(screen.getByTestId('login-submit')).toBeInTheDocument();
    expect(screen.getByTestId('login-status-notice')).toHaveTextContent(
      pt.auth.login.statusUnavailable,
    );
  });

  it('Dado passwordSetupRequired falso, então o login normal segue sem aviso', async () => {
    await setup();

    expect(screen.getByTestId('login-submit')).toBeInTheDocument();
    expect(screen.queryByTestId('login-status-notice')).toBeNull();
    expect(screen.queryByTestId('setup-form')).toBeNull();
  });
});
