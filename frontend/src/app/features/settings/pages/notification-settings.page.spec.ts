import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { NotificationSettingsPage } from '~/app/features/settings/pages/notification-settings.page';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  aProblem,
  NotificationsGatewayStub,
  provideNotificationsStub,
  PushDeviceFake,
  someSettings,
} from '~/testing/notifications-testing';

async function setup(gateway = new NotificationsGatewayStub(), device = new PushDeviceFake()) {
  const result = await render(NotificationSettingsPage, {
    providers: [
      provideI18nTesting('pt'),
      provideRouter([]),
      provideNotificationsStub(gateway, device),
    ],
  });
  await result.fixture.whenStable();
  result.fixture.detectChanges();
  return { ...result, gateway, device };
}

describe('NotificationSettingsPage (T136)', () => {
  it('Dado as configurações do backend, então preenche o formulário', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.settingsValue = someSettings({ displayName: 'Ana', kinds: { INVOICE_DUE: false } });
    await setup(gateway);

    expect(screen.getByTestId('settings-daily-time')).toHaveValue('08:00');
    expect(screen.getByTestId('settings-display-name')).toHaveValue('Ana');
    expect(screen.getByTestId('settings-kind-INVOICE_DUE')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByTestId('settings-kind-DEBT_COLLECT')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('Dado salvar, então envia a version carregada e mostra o resultado do backend', async () => {
    const gateway = new NotificationsGatewayStub();
    const { fixture } = await setup(gateway);

    await userEvent.click(screen.getByTestId('settings-kind-GOAL_DEADLINE'));
    await userEvent.click(screen.getByTestId('notification-settings-save'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.savedSettings).toHaveLength(1);
    expect(gateway.savedSettings[0]?.version).toBe(3);
    expect(gateway.savedSettings[0]?.kinds.GOAL_DEADLINE).toBe(false);
    expect(screen.getByTestId('notification-settings-saved')).toBeInTheDocument();
  });

  it('Dado horário inválido, então não salva', async () => {
    const gateway = new NotificationsGatewayStub();
    const { fixture } = await setup(gateway);
    const time = screen.getByTestId('settings-daily-time');
    await userEvent.clear(time);
    await userEvent.type(time, '99:99');
    await userEvent.click(screen.getByTestId('notification-settings-save'));
    await fixture.whenStable();
    expect(gateway.savedSettings).toEqual([]);
  });

  it('Dado 409 (VERSION_CONFLICT), então avisa e recarrega a versão atual', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.saveError = aProblem(409, 'VERSION_CONFLICT');
    const { fixture } = await setup(gateway);
    await userEvent.click(screen.getByTestId('notification-settings-save'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(screen.getByTestId('notification-settings-error')).toHaveTextContent(
      'As configurações mudaram em outro lugar',
    );
  });

  it('Dado push desligado no servidor, então diz isso em texto e não oferece o botão', async () => {
    await setup();
    expect(screen.getByTestId('push-status')).toHaveTextContent(
      'Notificações no dispositivo ainda não estão ativadas neste servidor.',
    );
    expect(screen.queryByTestId('push-enable')).not.toBeInTheDocument();
  });

  it('Dado iPhone fora da PWA, então explica como instalar (em texto)', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.pushConfigValue = { enabled: true, publicKey: 'K' };
    const device = new PushDeviceFake();
    device.capabilityValue = 'ios-needs-install';
    await setup(gateway, device);
    expect(screen.getByTestId('push-status')).toHaveTextContent(
      'No iPhone, adicione o app à tela inicial',
    );
    expect(screen.queryByTestId('push-enable')).not.toBeInTheDocument();
  });

  it('Dado permissão negada, então explica como reativar', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.pushConfigValue = { enabled: true, publicKey: 'K' };
    const device = new PushDeviceFake();
    device.permissionValue = 'denied';
    await setup(gateway, device);
    expect(screen.getByTestId('push-status')).toHaveTextContent('Reative-as nas configurações');
  });

  it('Dado push disponível, então só o clique pede permissão e assina; "Desativar" cancela', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.pushConfigValue = { enabled: true, publicKey: 'K' };
    const { fixture, device } = await setup(gateway);
    expect(device.subscribeKeys).toEqual([]);

    await userEvent.click(screen.getByTestId('push-enable'));
    await vi.waitFor(() => expect(screen.getByTestId('push-disable')).toBeInTheDocument());
    expect(device.subscribeKeys).toEqual(['K']);
    expect(gateway.subscriptions).toHaveLength(1);

    await userEvent.click(screen.getByTestId('push-disable'));
    await vi.waitFor(() => expect(screen.getByTestId('push-enable')).toBeInTheDocument());
    expect(gateway.calls).toContain('unsubscribe:sub-1');
    fixture.detectChanges();
  });

  it('Dado a página, então o axe não aponta violações', async () => {
    const { container } = await setup();
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
