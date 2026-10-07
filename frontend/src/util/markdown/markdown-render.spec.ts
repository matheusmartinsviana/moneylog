import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fakeMarkdownWorkerFactory,
  type FakeMarkdownWorker,
  neverRespond,
  respondWithRealParser,
} from '~/testing/markdown-worker-testing';
import {
  MARKDOWN_BOOT_TIMEOUT_MS,
  MARKDOWN_INLINE_FALLBACK_CHARS,
  MARKDOWN_PARSE_TIMEOUT_MS,
  MarkdownRenderer,
} from '~/util/markdown/markdown-render';

describe('MarkdownRenderer (Web Worker com tempo limite, F1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Dado um texto comum, então devolve a árvore calculada pelo worker', async () => {
    const renderer = new MarkdownRenderer({ factory: fakeMarkdownWorkerFactory() });

    const pending = renderer.render('# Título');
    await vi.advanceTimersByTimeAsync(0);
    const outcome = await pending;

    expect(outcome).toMatchObject({ kind: 'document' });
    if (outcome?.kind === 'document') expect(outcome.document.blocks[0]?.kind).toBe('heading');
  });

  it('Dado um parser falso e lento, então estoura o tempo limite, encerra o worker e devolve texto simples', async () => {
    const created: FakeMarkdownWorker[] = [];
    const renderer = new MarkdownRenderer({
      factory: fakeMarkdownWorkerFactory(neverRespond, created),
    });

    const pending = renderer.render('*a '.repeat(10));
    await vi.advanceTimersByTimeAsync(MARKDOWN_PARSE_TIMEOUT_MS - 1);
    expect(created[0]?.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(2);

    await expect(pending).resolves.toEqual({
      kind: 'plain',
      text: '*a '.repeat(10),
      reason: 'timeout',
    });
    expect(created[0]?.terminated).toBe(true);
  });

  it('Dado um tempo limite, então o próximo pedido sobe um worker novo (o antigo foi encerrado)', async () => {
    const created: FakeMarkdownWorker[] = [];
    let slow = true;
    const renderer = new MarkdownRenderer({
      factory: fakeMarkdownWorkerFactory(
        (request, worker) =>
          slow ? neverRespond(request, worker) : respondWithRealParser(request, worker),
        created,
      ),
    });

    const first = renderer.render('lento');
    await vi.advanceTimersByTimeAsync(MARKDOWN_PARSE_TIMEOUT_MS + 1);
    await first;
    slow = false;
    const second = renderer.render('rápido');
    await vi.advanceTimersByTimeAsync(0);

    expect(created).toHaveLength(2);
    expect(created[0]?.terminated).toBe(true);
    await expect(second).resolves.toMatchObject({ kind: 'document' });
  });

  it('Dado o mesmo texto que já estourou, então não repete o tempo limite inteiro', async () => {
    const created: FakeMarkdownWorker[] = [];
    const renderer = new MarkdownRenderer({
      factory: fakeMarkdownWorkerFactory(neverRespond, created),
    });
    const first = renderer.render('pesado');
    await vi.advanceTimersByTimeAsync(MARKDOWN_PARSE_TIMEOUT_MS + 1);
    await first;

    const again = await renderer.render('pesado');

    expect(again).toMatchObject({ kind: 'plain', reason: 'timeout' });
    expect(created).toHaveLength(1);
  });

  it('Dado um pedido novo antes do anterior terminar, então o resultado velho é descartado (null)', async () => {
    const created: FakeMarkdownWorker[] = [];
    const renderer = new MarkdownRenderer({
      factory: fakeMarkdownWorkerFactory(neverRespond, created),
    });

    const old = renderer.render('velho');
    await vi.advanceTimersByTimeAsync(0);
    const fresh = renderer.render('novo');

    await expect(old).resolves.toBeNull();
    expect(created[0]?.terminated).toBe(true);
    expect(created).toHaveLength(2);
    void fresh;
  });

  it('Dado uma resposta com requestId antigo, então ela é ignorada', async () => {
    const created: FakeMarkdownWorker[] = [];
    const renderer = new MarkdownRenderer({
      factory: fakeMarkdownWorkerFactory(neverRespond, created),
    });
    const pending = renderer.render('atual');
    await vi.advanceTimersByTimeAsync(0);
    const worker = created[0];
    const currentId = worker?.requests[0]?.requestId ?? 0;

    worker?.onmessage?.({
      data: {
        type: 'result',
        requestId: currentId - 1,
        document: { blocks: [], truncated: false },
      },
    });
    await vi.advanceTimersByTimeAsync(MARKDOWN_PARSE_TIMEOUT_MS + 1);

    await expect(pending).resolves.toMatchObject({ kind: 'plain', reason: 'timeout' });
  });

  it('Dado o worker que ainda está carregando, então o relógio do parsing só começa no "ready"', async () => {
    const worker: FakeMarkdownWorker = {
      requests: [],
      terminated: false,
      onmessage: null,
      onerror: null,
      postMessage: (request) => {
        worker.requests.push(request);
      },
      terminate: () => {
        worker.terminated = true;
      },
    };
    const ready = () => worker.onmessage?.({ data: { type: 'ready' } });
    const renderer = new MarkdownRenderer({ factory: () => worker });

    const pending = renderer.render('texto');
    await vi.advanceTimersByTimeAsync(MARKDOWN_PARSE_TIMEOUT_MS + 500);
    expect(worker.terminated).toBe(false);
    ready();
    worker.onmessage?.({
      data: {
        type: 'result',
        requestId: worker.requests[0]?.requestId ?? 0,
        document: { blocks: [], truncated: false },
      },
    });

    await expect(pending).resolves.toMatchObject({ kind: 'document' });
  });

  it('Dado um worker que nunca sobe, então desiste no prazo de boot e mostra texto simples', async () => {
    const worker: FakeMarkdownWorker = {
      requests: [],
      terminated: false,
      onmessage: null,
      onerror: null,
      postMessage: () => undefined,
      terminate: () => {
        worker.terminated = true;
      },
    };
    const renderer = new MarkdownRenderer({ factory: () => worker });

    const pending = renderer.render('texto');
    await vi.advanceTimersByTimeAsync(MARKDOWN_BOOT_TIMEOUT_MS + 1);

    await expect(pending).resolves.toMatchObject({ kind: 'plain', reason: 'timeout' });
    expect(worker.terminated).toBe(true);
  });

  it('Dado erro no worker, então mostra texto simples (nunca falha a tela)', async () => {
    const renderer = new MarkdownRenderer({
      factory: fakeMarkdownWorkerFactory((_request, worker) => worker.onerror?.(new Error('boom'))),
    });

    const pending = renderer.render('texto');
    await vi.advanceTimersByTimeAsync(0);

    await expect(pending).resolves.toMatchObject({ kind: 'plain', reason: 'error' });
  });

  it('Dado ambiente sem Worker, então formata só texto curto e mostra o resto como texto simples', async () => {
    const renderer = new MarkdownRenderer({ factory: () => null });

    await expect(renderer.render('**ok**')).resolves.toMatchObject({ kind: 'document' });
    await expect(
      renderer.render('*a '.repeat(MARKDOWN_INLINE_FALLBACK_CHARS)),
    ).resolves.toMatchObject({ kind: 'plain', reason: 'unavailable' });
  });

  it('Dado destroy, então encerra o worker e solta o pedido em andamento', async () => {
    const created: FakeMarkdownWorker[] = [];
    const renderer = new MarkdownRenderer({
      factory: fakeMarkdownWorkerFactory(neverRespond, created),
    });
    const pending = renderer.render('texto');
    await vi.advanceTimersByTimeAsync(0);

    renderer.destroy();

    await expect(pending).resolves.toBeNull();
    expect(created[0]?.terminated).toBe(true);
    await expect(renderer.render('outro')).resolves.toBeNull();
  });
});
