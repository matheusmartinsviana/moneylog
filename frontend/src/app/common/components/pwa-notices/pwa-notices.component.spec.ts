import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { PwaNoticesComponent } from '~/app/common/components/pwa-notices/pwa-notices.component';
import { type InstallMode, PwaService } from '~/app/common/services/pwa.service';
import { provideI18nTesting } from '~/testing/i18n-testing';

function setup(state: { online?: boolean; update?: boolean; install?: InstallMode } = {}) {
  const pwa = {
    online: signal(state.online ?? true),
    updateAvailable: signal(state.update ?? false),
    installMode: signal<InstallMode>(state.install ?? null),
    applyUpdate: vi.fn(() => Promise.resolve()),
    install: vi.fn(() => Promise.resolve()),
    dismissInstall: vi.fn(),
  };
  return render(PwaNoticesComponent, {
    providers: [provideI18nTesting(), { provide: PwaService, useValue: pwa }],
  }).then(() => pwa);
}

describe('PwaNoticesComponent', () => {
  it('Dado online sem novidades, então não mostra aviso algum', async () => {
    await setup();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Dado sem conexão, então avisa que escritas exigem rede', async () => {
    await setup({ online: false });
    expect(screen.getByRole('status').textContent).toContain('sem conexão');
    expect(screen.getByRole('status').textContent).toContain('online');
  });

  it('Dado nova versão, quando clica em Atualizar, então pede confirmação antes de recarregar', async () => {
    const pwa = await setup({ update: true });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(pwa.applyUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/não salvou/)).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: 'Atualizar' }).at(-1)!);
    expect(pwa.applyUpdate).toHaveBeenCalledOnce();
  });

  it('Dado nova versão, quando cancela a confirmação, então nada é recarregado', async () => {
    const pwa = await setup({ update: true });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    await user.click(screen.getByRole('button', { name: 'Agora não' }));

    expect(pwa.applyUpdate).not.toHaveBeenCalled();
  });

  it('Dado convite do navegador, quando instala ou dispensa, então chama o serviço', async () => {
    const pwa = await setup({ install: 'prompt' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Instalar' }));
    await user.click(screen.getByRole('button', { name: 'Dispensar' }));

    expect(pwa.install).toHaveBeenCalledOnce();
    expect(pwa.dismissInstall).toHaveBeenCalledOnce();
  });

  it('Dado iOS, então mostra a instrução e não o botão Instalar', async () => {
    await setup({ install: 'ios' });
    expect(screen.getByText(/adicionar à tela de início/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Instalar' })).toBeNull();
  });
});
