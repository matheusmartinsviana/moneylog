import { ChangeDetectionStrategy, Component } from '@angular/core';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, Observable } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { NotificationsPopoverComponent } from '~/app/features/notifications/components/notifications-popover.component';
import type {
  NotificationsQuery,
  AppNotification,
} from '~/modules/notifications/core/types/notification';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  aNotification,
  aProblem,
  NotificationsGatewayStub,
  provideNotificationsStub,
} from '~/testing/notifications-testing';
import type { Slice } from '~/util/api/slice';

@Component({ selector: 'app-blank', template: '', changeDetection: ChangeDetectionStrategy.OnPush })
class BlankComponent {}

/** Porta que nunca responde: mantém o pop-up em "carregando". */
class PendingGateway extends NotificationsGatewayStub {
  override list(query: NotificationsQuery): Observable<Slice<AppNotification>> {
    this.queries.push(query);
    return NEVER;
  }
}

async function setup(gateway: NotificationsGatewayStub = new NotificationsGatewayStub()) {
  const result = await render(NotificationsPopoverComponent, {
    providers: [
      provideI18nTesting('pt'),
      provideRouter([{ path: '**', component: BlankComponent }]),
      provideNotificationsStub(gateway),
    ],
  });
  return { ...result, gateway, bell: screen.getByTestId('header-bell') };
}

describe('NotificationsPopoverComponent (sino do cabeçalho)', () => {
  it('Dado o sino fechado, então não há pop-up e a lista não foi pedida (carga lazy)', async () => {
    const { gateway, bell } = await setup();

    expect(bell).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('notifications-popover')).not.toBeInTheDocument();
    expect(gateway.queries).toHaveLength(0);
  });

  it('Dado um clique no sino, então abre o pop-up e só então pede as últimas notificações', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.notifications = [
      aNotification({ id: 'n-1' }),
      aNotification({ id: 'n-2', readAt: 'x' }),
    ];
    const { bell } = await setup(gateway);

    await userEvent.click(bell);

    expect(bell).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByTestId('notifications-popover')).toBeInTheDocument();
    expect(gateway.queries).toEqual([
      expect.objectContaining({ status: 'ALL', kind: null, page: 1 }),
    ]);
    const items = screen.getAllByTestId('notifications-popover-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Fatura vence em 3 dias');
    expect(items[0]).toHaveAttribute('href', '/cards/card-1');
    expect(screen.getAllByTestId('notifications-popover-unread')).toHaveLength(1);
    expect(screen.getByTestId('notifications-popover-all')).toHaveAttribute(
      'href',
      '/notifications',
    );
  });

  it('Dado o pop-up aberto, quando aperta Esc, então fecha e o foco volta ao botão do sino', async () => {
    const { bell } = await setup();
    await userEvent.click(bell);
    await screen.findByTestId('notifications-popover');

    await userEvent.keyboard('{Escape}');

    await vi.waitFor(() =>
      expect(screen.queryByTestId('notifications-popover')).not.toBeInTheDocument(),
    );
    await vi.waitFor(() => expect(bell).toHaveFocus());
    expect(bell).toHaveAttribute('aria-expanded', 'false');
  });

  it('Dado o pop-up aberto, quando clica no sino de novo, então fecha', async () => {
    const { bell } = await setup();
    await userEvent.click(bell);
    await screen.findByTestId('notifications-popover');

    await userEvent.click(bell);

    await vi.waitFor(() =>
      expect(screen.queryByTestId('notifications-popover')).not.toBeInTheDocument(),
    );
  });

  it('Dado nenhuma notificação, então mostra o estado vazio e "Marcar todas" desligado', async () => {
    await setup();
    await userEvent.click(screen.getByTestId('header-bell'));

    expect(await screen.findByTestId('notifications-popover-empty')).toHaveTextContent(
      pt.notifications.popover.empty,
    );
    expect(screen.getByTestId('notifications-popover-mark-all')).toBeDisabled();
    expect(screen.getByTestId('notifications-popover-all')).toBeInTheDocument();
  });

  it('Dado a lista em carregamento, então mostra o esqueleto e anuncia o carregamento', async () => {
    await setup(new PendingGateway());
    await userEvent.click(screen.getByTestId('header-bell'));

    const loading = await screen.findByTestId('notifications-popover-loading');
    expect(within(loading).getByRole('status')).toHaveTextContent(pt.notifications.center.loading);
  });

  it('Dado falha ao carregar, então mostra o erro e "Tentar de novo" recarrega a lista', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.listError = aProblem(500, 'INTERNAL');
    await setup(gateway);
    await userEvent.click(screen.getByTestId('header-bell'));

    expect(await screen.findByTestId('notifications-popover-error')).toHaveTextContent(
      pt.notifications.popover.error,
    );

    gateway.listError = null;
    gateway.notifications = [aNotification()];
    await userEvent.click(screen.getByTestId('notifications-popover-retry'));

    expect(await screen.findAllByTestId('notifications-popover-item')).toHaveLength(1);
    expect(screen.queryByTestId('notifications-popover-error')).not.toBeInTheDocument();
    expect(gateway.queries).toHaveLength(2);
  });

  it('Dado notificações não lidas, quando marca todas, então chama o backend e relê a lista', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.notifications = [aNotification()];
    await setup(gateway);
    await userEvent.click(screen.getByTestId('header-bell'));
    await screen.findAllByTestId('notifications-popover-item');

    await userEvent.click(screen.getByTestId('notifications-popover-mark-all'));

    await vi.waitFor(() => expect(gateway.calls).toContain('markAllRead'));
    await vi.waitFor(() =>
      expect(screen.queryByTestId('notifications-popover-unread')).not.toBeInTheDocument(),
    );
  });

  it('Dado uma notificação, quando clica nela, então o pop-up fecha (o foco segue para a tela aberta)', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.notifications = [aNotification()];
    await setup(gateway);
    await userEvent.click(screen.getByTestId('header-bell'));

    await userEvent.click(await screen.findByTestId('notifications-popover-item'));

    await vi.waitFor(() =>
      expect(screen.queryByTestId('notifications-popover')).not.toBeInTheDocument(),
    );
  });

  it('Dado o pop-up aberto, então o axe não aponta violações', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.notifications = [aNotification()];
    await setup(gateway);
    await userEvent.click(screen.getByTestId('header-bell'));
    await screen.findAllByTestId('notifications-popover-item');

    const violations = await axeViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
