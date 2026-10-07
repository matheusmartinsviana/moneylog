import type { MdDocument } from '~/util/markdown/markdown';

/**
 * Execução **isolada e com tempo limite** do Markdown (F1, ADR-009 §5). O lexer do `marked` tem custo
 * quadrático em entradas pequenas e patológicas (`*a *a ...` leva 22 s em 40 KB), e nenhum teto de tamanho
 * resolve isso. Por isso o lexing/parsing roda num **Web Worker**: a thread principal nunca fica presa. Se o
 * worker passar do tempo limite, ele é encerrado (`terminate()`) e a nota aparece como **texto simples**.
 * Este arquivo é só lógica (sem Angular, sem `Worker` real): a "porta" é a `MarkdownWorkerFactory`, que os
 * testes trocam por um parser falso e lento.
 */

/** Tempo limite do parsing, contado a partir do momento em que o worker está pronto. */
export const MARKDOWN_PARSE_TIMEOUT_MS = 1_500;
/** Tempo máximo para o worker subir (carregar o script) antes de desistir e mostrar texto simples. */
export const MARKDOWN_BOOT_TIMEOUT_MS = 10_000;
/** Sem `Worker` (navegador sem suporte, jsdom), só textos até este tamanho são formatados na thread principal. */
export const MARKDOWN_INLINE_FALLBACK_CHARS = 2_000;

/** Pedido ao worker. */
export interface MarkdownWorkerRequest {
  readonly requestId: number;
  readonly text: string;
}

/** Mensagens do worker para a página. */
export type MarkdownWorkerMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'result'; readonly requestId: number; readonly document: MdDocument }
  | { readonly type: 'error'; readonly requestId: number };

/** O que a página precisa de um worker (um `Worker` real cumpre a interface). */
export interface MarkdownWorkerHandle {
  postMessage(message: MarkdownWorkerRequest): void;
  terminate(): void;
  onmessage: ((event: { readonly data: MarkdownWorkerMessage }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

/** A porta: cria um worker, ou `null` quando o ambiente não tem `Worker`. */
export type MarkdownWorkerFactory = () => MarkdownWorkerHandle | null;

export type PlainReason = 'timeout' | 'unavailable' | 'error';

/** O resultado de um pedido: a árvore, ou o texto simples com o motivo. */
export type RenderOutcome =
  | { readonly kind: 'document'; readonly document: MdDocument }
  | { readonly kind: 'plain'; readonly text: string; readonly reason: PlainReason };

interface Pending {
  readonly requestId: number;
  readonly text: string;
  readonly resolve: (outcome: RenderOutcome | null) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

const EMPTY_DOCUMENT: MdDocument = { blocks: [], truncated: false };

export interface MarkdownRendererOptions {
  readonly factory: MarkdownWorkerFactory;
  readonly timeoutMs?: number;
  readonly bootTimeoutMs?: number;
}

/**
 * Um worker reaproveitado entre pedidos. Um pedido novo **substitui** o anterior: o resultado antigo é
 * descartado (`render` resolve `null`) e o worker ocupado é encerrado, para o trabalho obsoleto não competir.
 */
export class MarkdownRenderer {
  private worker: MarkdownWorkerHandle | null = null;
  private ready = false;
  private pending: Pending | null = null;
  private lastRequestId = 0;
  /** O último texto que deu errado: reabrir a mesma nota não repete o tempo limite inteiro. */
  private lastFailure: { text: string; outcome: RenderOutcome } | null = null;
  private destroyed = false;

  private readonly timeoutMs: number;
  private readonly bootTimeoutMs: number;
  private readonly factory: MarkdownWorkerFactory;

  constructor(options: MarkdownRendererOptions) {
    this.factory = options.factory;
    this.timeoutMs = options.timeoutMs ?? MARKDOWN_PARSE_TIMEOUT_MS;
    this.bootTimeoutMs = options.bootTimeoutMs ?? MARKDOWN_BOOT_TIMEOUT_MS;
  }

  /** Resolve com o resultado, ou `null` se um pedido mais novo (ou o `destroy`) o tornou obsoleto. */
  render(text: string): Promise<RenderOutcome | null> {
    this.supersede();
    if (this.destroyed) return Promise.resolve(null);
    if (text.trim() === '') return Promise.resolve({ kind: 'document', document: EMPTY_DOCUMENT });
    if (this.lastFailure?.text === text) return Promise.resolve(this.lastFailure.outcome);
    const requestId = ++this.lastRequestId;
    return new Promise<RenderOutcome | null>((resolve) => {
      const worker = this.ensureWorker();
      if (!worker) {
        void this.withoutWorker(text, requestId).then(resolve);
        return;
      }
      const pending: Pending = { requestId, text, resolve, timer: null };
      this.pending = pending;
      // Antes de o worker subir, vale o prazo de boot; depois do `ready`, o tempo do parsing.
      pending.timer = setTimeout(
        () => this.fail(pending, 'timeout'),
        this.ready ? this.timeoutMs : this.bootTimeoutMs,
      );
      worker.postMessage({ requestId, text });
    });
  }

  /** Encerra o worker e solta o pedido em andamento. */
  destroy(): void {
    this.destroyed = true;
    this.supersede();
    this.dropWorker();
  }

  /**
   * Sem `Worker`: só texto curto é formatado aqui (o lexer é carregado sob demanda: o pacote principal não
   * leva o `marked`); o resto vira texto simples. Um pedido mais novo descarta este resultado (`null`).
   */
  private async withoutWorker(text: string, requestId: number): Promise<RenderOutcome | null> {
    if (text.length > MARKDOWN_INLINE_FALLBACK_CHARS) {
      return { kind: 'plain', text, reason: 'unavailable' };
    }
    try {
      const { parseMarkdownDocument } = await import('~/util/markdown/markdown');
      if (requestId !== this.lastRequestId || this.destroyed) return null;
      return { kind: 'document', document: parseMarkdownDocument(text) };
    } catch {
      return { kind: 'plain', text, reason: 'error' };
    }
  }

  private ensureWorker(): MarkdownWorkerHandle | null {
    if (this.worker) return this.worker;
    let worker: MarkdownWorkerHandle | null = null;
    try {
      worker = this.factory();
    } catch {
      worker = null;
    }
    if (!worker) return null;
    this.ready = false;
    worker.onmessage = (event) => this.onMessage(worker, event.data);
    worker.onerror = () => {
      const pending = this.pending;
      if (this.worker === worker && pending) this.fail(pending, 'error');
    };
    this.worker = worker;
    return worker;
  }

  private onMessage(source: MarkdownWorkerHandle, message: MarkdownWorkerMessage): void {
    if (source !== this.worker) return;
    const pending = this.pending;
    if (message.type === 'ready') {
      this.ready = true;
      // O relógio do parsing começa agora (o carregamento do script não gasta o orçamento).
      if (pending) {
        if (pending.timer) clearTimeout(pending.timer);
        pending.timer = setTimeout(() => this.fail(pending, 'timeout'), this.timeoutMs);
      }
      return;
    }
    // Resultado de um pedido que não é o atual: obsoleto, descartado.
    if (!pending || message.requestId !== pending.requestId) return;
    this.pending = null;
    if (pending.timer) clearTimeout(pending.timer);
    if (message.type === 'result') {
      pending.resolve({ kind: 'document', document: message.document });
    } else {
      this.remember(pending.text, 'error');
      pending.resolve({ kind: 'plain', text: pending.text, reason: 'error' });
    }
  }

  private fail(pending: Pending, reason: PlainReason): void {
    if (this.pending !== pending) return;
    this.pending = null;
    if (pending.timer) clearTimeout(pending.timer);
    // O worker pode estar preso no lexer: encerra de verdade (um novo sobe no próximo pedido).
    this.dropWorker();
    this.remember(pending.text, reason);
    pending.resolve({ kind: 'plain', text: pending.text, reason });
  }

  private remember(text: string, reason: PlainReason): void {
    this.lastFailure = { text, outcome: { kind: 'plain', text, reason } };
  }

  private supersede(): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    if (pending.timer) clearTimeout(pending.timer);
    pending.resolve(null);
    // O worker ainda processa o texto velho: encerra para não atrasar o novo.
    this.dropWorker();
  }

  private dropWorker(): void {
    const worker = this.worker;
    this.worker = null;
    this.ready = false;
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    try {
      worker.terminate();
    } catch {
      // nada a fazer: o worker já morreu
    }
  }
}
