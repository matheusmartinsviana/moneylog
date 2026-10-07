import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { LANGUAGE_STORAGE_KEY } from '~/app/common/i18n/i18n.service';
import { THEME_STORAGE_KEY } from '~/app/common/services/theme.service';
import { SettingsPage } from '~/app/features/settings/pages/settings.page';
import { SessionFacade } from '~/modules/auth/core/facades/session.facade';
import { AuthGatewayStub, provideAuthStub } from '~/testing/auth-testing';
import { provideExportsStub } from '~/testing/etapa5-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideNotesStub } from '~/testing/notes-testing';

describe('SettingsPage', () => {
  async function setup(gateway = new AuthGatewayStub()) {
    const result = await render(SettingsPage, {
      providers: [
        provideI18nTesting('pt'),
        provideRouter([{ path: 'login', component: SettingsPage }]),
        provideAuthStub(gateway),
        provideExportsStub(),
        provideNotesStub(),
      ],
    });
    return { ...result, gateway };
  }

  it('Dado as preferências, quando escolho English, então a UI muda, persiste e o <html lang> acompanha', async () => {
    const { fixture } = await setup();

    await userEvent.click(screen.getByTestId('settings-language'));
    await userEvent.click(screen.getByTestId('settings-language-option-en'));
    await fixture.whenStable();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('Dado as preferências, quando escolho o tema escuro, então aplica data-theme e persiste', async () => {
    await setup();

    await userEvent.click(screen.getByTestId('settings-theme'));
    await userEvent.click(screen.getByTestId('settings-theme-option-dark'));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('Dado a página, então mostra o estado vazio do que ainda não existe, com ação indisponível', async () => {
    await setup();

    expect(screen.getByTestId('empty-state-action-connect-ai')).toBeDisabled();
    expect(TestBed.inject(SettingsPage, null)).toBeNull();
  });

  it('Dado a sessão, quando clico em "Sair", então chama o logout, descarta o token e vai para /login', async () => {
    const { fixture, gateway } = await setup();
    const session = TestBed.inject(SessionFacade);
    session.login({ email: 'a@b.c', password: 'x' });
    expect(session.token()).not.toBeNull();

    await userEvent.click(screen.getByTestId('settings-sign-out'));
    await fixture.whenStable();

    expect(gateway.logouts).toBe(1);
    expect(session.token()).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('Dado a página, então "Seus dados" traz exportar e importar o vault, honesto sobre o armazenamento', async () => {
    await setup();

    expect(screen.getByTestId('vault-section')).toBeInTheDocument();
    expect(screen.getByTestId('vault-storage')).toHaveTextContent(
      'guardadas no servidor do moneylog',
    );
    expect(screen.getByTestId('vault-export-action')).toBeInTheDocument();
    expect(screen.getByTestId('vault-import-action')).toBeInTheDocument();
  });

  it('Dado a página, então há o atalho para Categorias', async () => {
    await setup();

    expect(screen.getByTestId('settings-categories-link')).toHaveAttribute(
      'href',
      '/settings/categories',
    );
  });
});
