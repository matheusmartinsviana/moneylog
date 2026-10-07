import { DestroyRef, inject, Injectable, InjectionToken } from '@angular/core';

import {
  MarkdownRenderer,
  type MarkdownWorkerFactory,
  type MarkdownWorkerHandle,
  type RenderOutcome,
} from '~/util/markdown/markdown-render';

/**
 * A porta do executor do Markdown (F1): por padrão cria o Web Worker de verdade (empacotado pelo build do
 * Angular como um arquivo `worker-*.js` da mesma origem, sem `blob:`); os testes (jsdom não tem `Worker`)
 * trocam por um parser falso e lento.
 */
export const MARKDOWN_WORKER_FACTORY = new InjectionToken<MarkdownWorkerFactory>(
  'MARKDOWN_WORKER_FACTORY',
  {
    providedIn: 'root',
    factory: () => () => {
      if (typeof Worker === 'undefined') return null;
      return new Worker(new URL('../../../../../util/markdown/markdown.worker', import.meta.url), {
        type: 'module',
        name: 'markdown',
      }) as unknown as MarkdownWorkerHandle;
    },
  },
);

/** Um executor por componente (cada pré-visualização tem o seu worker, encerrado ao destruir a tela). */
@Injectable()
export class MarkdownRenderService {
  private readonly renderer = new MarkdownRenderer({ factory: inject(MARKDOWN_WORKER_FACTORY) });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.renderer.destroy());
  }

  /** `null` quando um pedido mais novo tornou este obsoleto. */
  render(text: string): Promise<RenderOutcome | null> {
    return this.renderer.render(text);
  }
}
