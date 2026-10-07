import { firstValueFrom, throwError } from 'rxjs';

import { cancelPushHook } from '~/app/session-end-hooks';
import { PUSH_SUBSCRIPTION_KEY } from '~/modules/notifications/core/facades/push.facade';
import { NotificationsGatewayStub } from '~/testing/notifications-testing';

describe('cancelPushHook (M4)', () => {
  afterEach(() => localStorage.clear());

  it('Dado uma assinatura guardada, quando sai, então cancela no backend e limpa o id', async () => {
    const gateway = new NotificationsGatewayStub();
    localStorage.setItem(PUSH_SUBSCRIPTION_KEY, 'sub-9');

    await firstValueFrom(cancelPushHook(gateway)());

    expect(gateway.calls).toContain('unsubscribe:sub-9');
    expect(localStorage.getItem(PUSH_SUBSCRIPTION_KEY)).toBeNull();
  });

  it('Dado o backend falhando, então não lança e ainda limpa o id', async () => {
    const gateway = new NotificationsGatewayStub();
    gateway.unsubscribePush = () => throwError(() => new Error('offline'));
    localStorage.setItem(PUSH_SUBSCRIPTION_KEY, 'sub-9');

    await expect(firstValueFrom(cancelPushHook(gateway)())).resolves.toBeUndefined();
    expect(localStorage.getItem(PUSH_SUBSCRIPTION_KEY)).toBeNull();
  });

  it('Dado nenhuma assinatura, então não chama o backend', async () => {
    const gateway = new NotificationsGatewayStub();
    await firstValueFrom(cancelPushHook(gateway)());
    expect(gateway.calls).toEqual([]);
  });
});
