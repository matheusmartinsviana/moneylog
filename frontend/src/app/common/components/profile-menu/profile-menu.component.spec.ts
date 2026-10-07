import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { ProfileMenuComponent } from '~/app/common/components/profile-menu/profile-menu.component';
import { pt } from '~/app/common/i18n/translations/pt';
import { SessionFacade } from '~/modules/auth/core/facades/session.facade';
import { AuthGatewayStub, provideAuthStub } from '~/testing/auth-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup() {
  const gateway = new AuthGatewayStub();
  const result = await render(ProfileMenuComponent, {
    inputs: { cy: 'profile' },
    routes: [{ path: '**', children: [] }],
    providers: [provideI18nTesting('pt'), provideAuthStub(gateway)],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  return { ...result, gateway, navigate };
}

describe('ProfileMenuComponent', () => {
  it('Dado o avatar, então é um botão de menu sem nome de usuário (D4) e sem seletor de workspace', async () => {
    await setup();

    const trigger = screen.getByTestId('profile');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAccessibleName(pt.header.profile.label);
    await userEvent.click(trigger);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual([
      pt.nav.settings,
      pt.header.profile.signOut,
    ]);
    expect(screen.queryByText(/workspace|espaço de trabalho/i)).not.toBeInTheDocument();
  });

  it('Dado "Configurações", quando escolho, então navega a /settings', async () => {
    const { navigate } = await setup();

    await userEvent.click(screen.getByTestId('profile'));
    await userEvent.click(screen.getByTestId('profile-item-settings'));

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/settings']));
  });

  it('Dado "Sair", quando escolho, então encerra a sessão uma vez e leva ao login', async () => {
    const { gateway, navigate } = await setup();
    TestBed.inject(SessionFacade);

    await userEvent.click(screen.getByTestId('profile'));
    await userEvent.click(screen.getByTestId('profile-item-signOut'));

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/login']));
    expect(gateway.logouts).toBe(1);
  });
});
