import type { Provider } from '@angular/core';

import { MARKDOWN_WORKER_FACTORY } from '~/app/features/notes/components/markdown-view/markdown-render.service';
import {
  type MarkdownWorkerFactory,
  type MarkdownWorkerHandle,
  type MarkdownWorkerRequest,
} from '~/util/markdown/markdown-render';
import { handleMarkdownRequest } from '~/util/markdown/markdown-worker-handler';

/**
 * Executor falso do Markdown para os testes (jsdom não tem `Worker`). `handle` decide o que fazer com cada
 * pedido: `respond` devolve o resultado (pelo parser real ou por um falso), `ignore` simula um lexer preso.
 */
export interface FakeMarkdownWorker extends MarkdownWorkerHandle {
  readonly requests: MarkdownWorkerRequest[];
  terminated: boolean;
}

export type FakeBehavior = (request: MarkdownWorkerRequest, worker: FakeMarkdownWorker) => void;

/** Responde na hora com o parser real (o que o worker de verdade faria). */
export const respondWithRealParser: FakeBehavior = (request, worker) => {
  worker.onmessage?.({ data: handleMarkdownRequest(request) });
};

/** Nunca responde: simula um lexer que se enrola (o tempo limite é o que resolve). */
export const neverRespond: FakeBehavior = () => undefined;

export function fakeMarkdownWorkerFactory(
  behavior: FakeBehavior = respondWithRealParser,
  created: FakeMarkdownWorker[] = [],
): MarkdownWorkerFactory {
  return () => {
    const worker: FakeMarkdownWorker = {
      requests: [],
      terminated: false,
      onmessage: null,
      onerror: null,
      postMessage(request) {
        worker.requests.push(request);
        // O worker de verdade responde de forma assíncrona.
        queueMicrotask(() => {
          if (!worker.terminated) behavior(request, worker);
        });
      },
      terminate() {
        worker.terminated = true;
      },
    };
    created.push(worker);
    queueMicrotask(() => {
      if (!worker.terminated) worker.onmessage?.({ data: { type: 'ready' } });
    });
    return worker;
  };
}

export function provideFakeMarkdownWorker(
  behavior: FakeBehavior = respondWithRealParser,
  created: FakeMarkdownWorker[] = [],
): Provider {
  return {
    provide: MARKDOWN_WORKER_FACTORY,
    useValue: fakeMarkdownWorkerFactory(behavior, created),
  };
}
