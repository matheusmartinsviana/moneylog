import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import {
  UNREAD_POLL_MS,
  UnreadCountFacade,
} from '~/modules/notifications/core/facades/unread-count.facade';
import {
  NotificationsGatewayStub,
  provideNotificationsStub,
} from '~/testing/notifications-testing';

function setup() {
  const gateway = new NotificationsGatewayStub();
  gateway.unread = 3;
  TestBed.configureTestingModule({ providers: [provideNotificationsStub(gateway)] });
  const facade = TestBed.inject(UnreadCountFacade);
  facade.connect(TestBed.inject(DestroyRef));
  return { gateway, facade };
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('UnreadCountFacade (T132 CA3)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    setVisibility('visible');
    vi.useRealTimers();
  });

  it('Dado o app aberto, então consulta ao abrir e a cada 60 s', async () => {
    const { gateway, facade } = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(facade.count()).toBe(3);
    expect(gateway.calls.filter((c) => c === 'unreadCount')).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS);
    expect(gateway.calls.filter((c) => c === 'unreadCount')).toHaveLength(2);
  });

  it('Dado a aba escondida, então para de consultar; ao voltar, consulta de novo', async () => {
    const { gateway } = setup();
    await vi.advanceTimersByTimeAsync(0);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS * 3);
    expect(gateway.calls.filter((c) => c === 'unreadCount')).toHaveLength(1);

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(gateway.calls.filter((c) => c === 'unreadCount')).toHaveLength(2);
  });

  it('Dado "refresh", então relê o número do backend', async () => {
    const { gateway, facade } = setup();
    await vi.advanceTimersByTimeAsync(0);
    gateway.unread = 0;
    facade.refresh();
    expect(facade.count()).toBe(0);
  });

  it('Dado nenhuma resposta ainda, então o número é desconhecido (null), não zero', () => {
    TestBed.configureTestingModule({ providers: [provideNotificationsStub()] });
    expect(TestBed.inject(UnreadCountFacade).count()).toBeNull();
  });
});
