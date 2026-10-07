import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

import {
  PushCapability,
  PushDevice,
  PushPermission,
} from '~/modules/notifications/core/interfaces/push-device';
import type { PushSubscriptionInput } from '~/modules/notifications/core/types/notification';

/** Chave VAPID (base64url) → bytes, o formato que `pushManager.subscribe` exige. */
export function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  return bytes;
}

function toBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Push do navegador de verdade (service worker + `PushManager` + `Notification`). */
@Injectable({ providedIn: 'root' })
export class BrowserPushDevice extends PushDevice {
  private readonly win = inject(DOCUMENT).defaultView;

  capability(): PushCapability {
    const w = this.win;
    if (!w) return 'unsupported';
    const ua = w.navigator.userAgent;
    const ios =
      /iPad|iPhone|iPod/.test(ua) ||
      (w.navigator.platform === 'MacIntel' && w.navigator.maxTouchPoints > 1);
    const standalone =
      (w.navigator as Navigator & { standalone?: boolean }).standalone === true ||
      w.matchMedia?.('(display-mode: standalone)').matches === true;
    if (ios && !standalone) return 'ios-needs-install';
    const supported = 'serviceWorker' in w.navigator && 'PushManager' in w && 'Notification' in w;
    return supported ? 'supported' : 'unsupported';
  }

  permission(): PushPermission {
    return this.win && 'Notification' in this.win ? this.win.Notification.permission : 'denied';
  }

  async currentEndpoint(): Promise<string | null> {
    const registration = await this.registration();
    this.syncLanguage(registration);
    const subscription = await registration?.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  }

  async subscribe(publicKey: string): Promise<PushSubscriptionInput> {
    const w = this.win;
    if (!w) throw new Error('push-unsupported');
    const permission = await w.Notification.requestPermission();
    if (permission !== 'granted') throw new Error('push-denied');
    const registration = await this.registration();
    if (!registration) throw new Error('push-unsupported');
    this.syncLanguage(registration);
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(publicKey),
      }));
    return {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: toBase64Url(subscription.getKey('p256dh')),
        auth: toBase64Url(subscription.getKey('auth')),
      },
      userAgent: w.navigator.userAgent.slice(0, 200),
    };
  }

  async unsubscribe(): Promise<void> {
    const registration = await this.registration();
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  }

  /** O worker não lê `localStorage`: o idioma da interface vai por mensagem (o texto do push sai no idioma certo). */
  private syncLanguage(registration: ServiceWorkerRegistration | null): void {
    const language = this.win?.document.documentElement.lang.slice(0, 2);
    if (language) registration?.active?.postMessage({ type: 'LANGUAGE', language });
  }

  private async registration(): Promise<ServiceWorkerRegistration | null> {
    const w = this.win;
    if (!w || !('serviceWorker' in w.navigator)) return null;
    return (await w.navigator.serviceWorker.getRegistration()) ?? null;
  }
}
