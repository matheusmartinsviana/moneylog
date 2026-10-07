/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Listener = (event: any) => void;

const root = process.cwd();
const code = readFileSync(join(root, 'src/sw-push.js'), 'utf8');

function loadWorker(language = 'pt') {
  const listeners = new Map<string, Listener>();
  const shown: { title: string; options: any }[] = [];
  const opened: string[] = [];
  const focused: string[] = [];
  const store = new Map<string, string>([['/__language', language]]);
  const fakeCaches = {
    open: () =>
      Promise.resolve({
        match: (key: string) =>
          Promise.resolve(
            store.has(key) ? { text: () => Promise.resolve(store.get(key)) } : undefined,
          ),
        put: (key: string, response: { value: string }) => {
          store.set(key, response.value);
          return Promise.resolve();
        },
      }),
  };
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    registration: {
      showNotification: (title: string, options: unknown) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
    },
    clients: {
      matchAll: () =>
        Promise.resolve([
          {
            focus: () => Promise.resolve(),
            navigate: (url: string) => {
              focused.push(url);
              return Promise.resolve({ focus: () => Promise.resolve() });
            },
          },
        ]),
      openWindow: (url: string) => {
        opened.push(url);
        return Promise.resolve();
      },
    },
  };
  class FakeResponse {
    constructor(readonly value: string) {}
  }
  new Function('self', 'importScripts', 'caches', 'Response', code)(
    self,
    () => undefined,
    fakeCaches,
    FakeResponse,
  );
  return { listeners, shown, opened, focused, store };
}

function pushEvent(data: unknown, raw = false) {
  const waits: Promise<unknown>[] = [];
  return {
    event: {
      data: {
        json: () => {
          if (raw) throw new SyntaxError('bad json');
          return data;
        },
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    },
    done: () => Promise.all(waits),
  };
}

describe('sw-push.js (T137 CA1)', () => {
  it('Dado um push válido, então mostra a notificação traduzida pelo kind no idioma guardado, com a url', async () => {
    const worker = loadWorker('en');
    const { event, done } = pushEvent({
      id: 'n-1',
      kind: 'INVOICE_DUE',
      titleKey: 'x',
      params: {},
    });
    worker.listeners.get('push')!(event);
    await done();

    expect(worker.shown).toHaveLength(1);
    expect(worker.shown[0]?.title).toBe('Card invoice');
    expect(worker.shown[0]?.options.data.url).toBe('/notifications');
    expect(worker.shown[0]?.options.tag).toBe('n-1');
  });

  it('Dado o idioma pt (padrão), então o texto sai em português', async () => {
    const worker = loadWorker('pt');
    const { event, done } = pushEvent({ id: 'n', kind: 'REMINDER' });
    worker.listeners.get('push')!(event);
    await done();
    expect(worker.shown[0]?.title).toBe('Lembrete');
  });

  it('Dado um kind desconhecido, então usa o texto neutro', async () => {
    const worker = loadWorker('pt');
    const { event, done } = pushEvent({ id: 'n', kind: 'FUTURO' });
    worker.listeners.get('push')!(event);
    await done();
    expect(worker.shown[0]?.title).toBe('Nova notificação');
  });

  it.each([
    ['JSON inválido', pushEvent(null, true)],
    ['payload nulo', pushEvent(null)],
    ['sem kind', pushEvent({ id: 'x' })],
    ['kind que não é texto', pushEvent({ kind: 3 })],
  ])('Dado payload malformado (%s), então é ignorado sem erro', async (_name, { event, done }) => {
    const worker = loadWorker();
    expect(() => worker.listeners.get('push')!(event)).not.toThrow();
    await done();
    expect(worker.shown).toEqual([]);
  });

  it('Dado push sem dados, então é ignorado', () => {
    const worker = loadWorker();
    expect(() =>
      worker.listeners.get('push')!({ data: null, waitUntil: () => undefined }),
    ).not.toThrow();
    expect(worker.shown).toEqual([]);
  });

  it('Dado o clique na notificação, então foca/abre o app na rota certa', async () => {
    const worker = loadWorker();
    const waits: Promise<unknown>[] = [];
    let closed = false;
    worker.listeners.get('notificationclick')!({
      notification: { data: { url: '/notifications' }, close: () => (closed = true) },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);
    expect(closed).toBe(true);
    expect(worker.focused).toEqual(['/notifications']);
  });

  it('Dado clique com url externa ou ausente, então nada é aberto', () => {
    const worker = loadWorker();
    const waits: Promise<unknown>[] = [];
    for (const data of [{ url: 'https://evil.example' }, {}, null]) {
      worker.listeners.get('notificationclick')!({
        notification: { data, close: () => undefined },
        waitUntil: (p: Promise<unknown>) => waits.push(p),
      });
    }
    expect(waits).toEqual([]);
  });

  it('Dado a mensagem LANGUAGE do app, então guarda o idioma (só os conhecidos)', async () => {
    const worker = loadWorker('pt');
    const waits: Promise<unknown>[] = [];
    const send = (data: unknown) =>
      worker.listeners.get('message')!({ data, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    send({ type: 'LANGUAGE', language: 'es' });
    send({ type: 'LANGUAGE', language: '../../x' });
    await Promise.all(waits);
    expect(waits).toHaveLength(1);
    expect(worker.store.get('/__language')).toBe('es');
  });
});

describe('manifest (T137 CA3)', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'src/manifest.webmanifest'), 'utf8'));

  it('Dado os atalhos, então são Novo registro, Pix e Crédito apontando para /quick-add?mode=', () => {
    const urls = manifest.shortcuts.map((s: { url: string }) => s.url);
    expect(urls).toEqual(['./quick-add', './quick-add?mode=pix', './quick-add?mode=credit']);
    for (const shortcut of manifest.shortcuts) {
      expect(shortcut.name).toBeTruthy();
      expect(shortcut.icons[0].src).toMatch(/^assets\/icons\/.*\.png$/);
    }
  });

  it('Dado o share_target, então é GET para /quick-add com title, text e url', () => {
    expect(manifest.share_target).toEqual({
      action: './quick-add',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    });
  });

  it('Dado os ícones, então continua instalável (192 e 512, inclusive maskable)', () => {
    const sizes = manifest.icons.map(
      (i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`,
    );
    expect(sizes).toEqual(
      expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']),
    );
  });
});
