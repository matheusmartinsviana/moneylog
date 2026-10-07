import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { pt } from '~/app/common/i18n/translations/pt';
import { NotificationsPage } from '~/app/features/notifications/pages/notifications.page';
import { UnreadCountFacade } from '~/modules/notifications/core/facades/unread-count.facade';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  aNotification,
  aProblem,
  aReminder,
  NotificationsGatewayStub,
  provideNotificationsStub,
} from '~/testing/notifications-testing';

async function setup(gateway = new NotificationsGatewayStub()) {
  const result = await render(NotificationsPage, {
    providers: [provideI18nTesting('pt'), provideRouter([]), provideNotificationsStub(gateway)],
  });
  await result.fixture.whenStable();
  result.fixture.detectChanges();
  return { ...result, gateway };
}

describe('NotificationsPage (T135)', () => {
  it('Dado nenhuma notificação, então "Nada por aqui." com a ação de configurar avisos', async () => {
    await setup();
    expect(screen.getAllByTestId('empty-state-title')[0]).toHaveTextContent('Nada por aqui.');
    expect(screen.getByTestId('empty-state-action-settings')).toHaveAttribute(
      'href',
      '/settings/notifications',
    );
  });

  it('Dado notificações, então mostra título e corpo traduzidos pela chave e os parâmetros, e leva à entidade', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.notifications = [aNotification()];
    await setup(gateway);

    expect(screen.getByTestId('notification-title')).toHaveTextContent('Fatura vence em 3 dias');
    expect(screen.getByTestId('notification-body').textContent).toMatch(/R\$\s?1\.423,00/);
    expect(screen.getByTestId('notification-open')).toHaveAttribute('href', '/cards/card-1');
    expect(screen.getByTestId('notification-unread')).toHaveTextContent('Não lida');
  });

  it('Dado uma chave desconhecida, então mostra o texto neutro, nunca a chave', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.notifications = [aNotification({ titleKey: 'notification.futura.x' })];
    await setup(gateway);
    expect(screen.getByTestId('notification-title')).toHaveTextContent('Nova notificação');
    expect(document.body.textContent).not.toContain('notification.futura');
  });

  it('Dado "Marcar como lida", então chama o backend e relê a lista e o contador', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.notifications = [aNotification({ id: 'n-1' })];
    gateway.unread = 1;
    const { fixture } = await setup(gateway);
    const unread = TestBed.inject(UnreadCountFacade);

    await userEvent.click(screen.getByTestId('notification-mark-read'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.calls).toContain('markRead:n-1');
    expect(screen.queryByTestId('notification-unread')).not.toBeInTheDocument();
    expect(unread.count()).toBe(0);
  });

  it('Dado "Marcar todas", então chama read-all', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.notifications = [aNotification({ id: 'a' }), aNotification({ id: 'b' })];
    gateway.unread = 2;
    const { fixture } = await setup(gateway);
    TestBed.inject(UnreadCountFacade).refresh();
    fixture.detectChanges();

    await userEvent.click(screen.getByTestId('notifications-mark-all'));
    await fixture.whenStable();

    expect(gateway.calls).toContain('markAllRead');
  });

  it('Dado erro ao carregar, então mostra o erro com "tentar de novo"', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.listError = aProblem(500, 'INTERNAL_ERROR');
    await setup(gateway);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-action-retry')).toBeInTheDocument();
  });

  it('Dado o filtro "Não lidas", então pede UNREAD ao backend', async () => {
    const gateway = new NotificationsGatewayStub();
    const { fixture } = await setup(gateway);
    await userEvent.click(screen.getByTestId('notifications-status-UNREAD'));
    await fixture.whenStable();
    expect(gateway.queries.at(-1)?.status).toBe('UNREAD');
  });

  it('Dado lembretes, então concluir e adiar chamam o backend', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.reminderList = [aReminder({ id: 'r-1' })];
    const { fixture } = await setup(gateway);
    expect(screen.getByTestId('reminder-row')).toHaveTextContent('Revisar o orçamento');

    await userEvent.click(screen.getByTestId('reminder-snooze'));
    await fixture.whenStable();
    expect(gateway.calls).toContain('snooze:r-1:1');

    await userEvent.click(screen.getByTestId('reminder-done'));
    await fixture.whenStable();
    expect(gateway.calls).toContain('complete:r-1');
  });

  it('Dado "Novo lembrete", então o formulário cria pelo backend com título e data', async () => {
    const gateway = new NotificationsGatewayStub();
    const { fixture } = await setup(gateway);

    await userEvent.click(screen.getByTestId('reminder-add'));
    const form = screen.getByTestId('reminder-form-form');
    await userEvent.type(within(form).getByTestId('reminder-title'), 'Pagar o aluguel');
    await userEvent.type(within(form).getByTestId('reminder-date'), '15102026');
    await userEvent.click(screen.getByTestId('reminder-save'));
    await fixture.whenStable();

    expect(gateway.createdReminders).toEqual([
      {
        title: 'Pagar o aluguel',
        remindOn: '2026-10-15',
        remindAt: null,
        note: null,
        link: null,
      },
    ]);
  });

  it('Dado a página com uma notificação, então o axe não aponta violações', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.notifications = [aNotification()];
    gateway.reminderList = [aReminder()];
    const { container } = await setup(gateway);
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado o texto da página, então vem do contrato pt (sem texto fixo)', async () => {
    await setup();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(pt.nav.notifications);
  });
});
