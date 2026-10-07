import type { PushSubscriptionInput } from '~/modules/notifications/core/types/notification';

export type PushCapability =
  /** Navegador sem `PushManager`/`Notification`/service worker. */
  | 'unsupported'
  /** iPhone/iPad fora da PWA instalada: o push só existe depois de adicionar à tela inicial. */
  | 'ios-needs-install'
  | 'supported';

export type PushPermission = 'default' | 'granted' | 'denied';

/**
 * Porta do dispositivo (navegador) para push. Só `subscribe` pede permissão, e só deve ser chamada por um
 * gesto do usuário. A implementação real está em `infra`; os testes usam um fake.
 */
export abstract class PushDevice {
  abstract capability(): PushCapability;
  abstract permission(): PushPermission;
  /** Endpoint da assinatura atual deste dispositivo, se houver. */
  abstract currentEndpoint(): Promise<string | null>;
  /** Pede permissão, assina com a chave VAPID pública e devolve a assinatura. Lança se negada. */
  abstract subscribe(publicKey: string): Promise<PushSubscriptionInput>;
  abstract unsubscribe(): Promise<void>;
}
