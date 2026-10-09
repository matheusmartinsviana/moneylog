import { firstValueFrom, of, throwError } from 'rxjs';

import {
  cancelPushHook,
  clearPrivateCachesHook,
  revokeGoalPhotosHook,
} from '~/app/session-end-hooks';
import { GoalPhotoCache } from '~/modules/goals/core/facades/goal-photo-cache';
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

describe('clearPrivateCachesHook (T177)', () => {
  function fakeCaches(names: string[]) {
    const store = new Set(names);
    return {
      store,
      api: {
        keys: () => Promise.resolve([...store]),
        delete: (name: string) => Promise.resolve(store.delete(name)),
      } as unknown as CacheStorage,
    };
  }

  it('Dado caches de dados e do shell, quando sai, então apaga os de dados e mantém ngsw e idioma', async () => {
    const { store, api } = fakeCaches(['ngsw:/:db:control', 'moneylog-prefs', 'api-v1', 'outro']);

    await firstValueFrom(clearPrivateCachesHook(api)());

    expect([...store].sort()).toEqual(['moneylog-prefs', 'ngsw:/:db:control']);
  });

  it('Dado o Cache Storage indisponível ou falhando, então não lança', async () => {
    await expect(firstValueFrom(clearPrivateCachesHook(undefined)())).resolves.toBeUndefined();
    const broken = { keys: () => Promise.reject(new Error('x')) } as unknown as CacheStorage;
    await expect(firstValueFrom(clearPrivateCachesHook(broken)())).resolves.toBeUndefined();
  });
});

describe('revokeGoalPhotosHook (ADR-018)', () => {
  it('Dado fotos em memória, quando sai, então revoga todos os blob URLs e esvazia o cache', async () => {
    const revoked: string[] = [];
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:sintetico-${++n}`);
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });
    const cache = new GoalPhotoCache();
    cache.fetch('g/a/thumb', () => of(new Blob(['x']))).subscribe();
    cache.fetch('g/b/display', () => of(new Blob(['y']))).subscribe();

    await firstValueFrom(revokeGoalPhotosHook(cache)());

    expect(revoked.sort()).toEqual(['blob:sintetico-1', 'blob:sintetico-2']);
    expect(cache.size).toBe(0);
  });
});
