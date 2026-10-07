import { DestroyRef, inject, Injectable, signal } from '@angular/core';

export type ToastTone = 'info' | 'error';

/** Ação curta no aviso (ex.: "Ver movimentações"). O texto já vem traduzido de quem chama. */
export interface ToastAction {
  /** Sufixo do `data-cy` do botão. */
  readonly id: string;
  readonly label: string;
  readonly run: () => void;
}

export interface ToastOptions {
  readonly tone?: ToastTone;
  /** Tempo na tela. Padrão: 5 s (info) e 8 s (erro). */
  readonly durationMs?: number;
  /** Ações do aviso; usar uma fecha o aviso. Com ações o aviso fica mais tempo na tela. */
  readonly actions?: readonly ToastAction[];
}

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
  readonly actions: readonly ToastAction[];
}

const DEFAULT_DURATION: Readonly<Record<ToastTone, number>> = { info: 5000, error: 8000 };
/** Aviso com ação precisa de tempo para ser lido e tocado. */
const ACTION_DURATION = 10_000;
/** Mais que isso empilha demais no celular: o aviso mais antigo sai. */
const MAX_VISIBLE = 3;

/**
 * Avisos curtos depois de uma ação ("Movimentação registrada."). Estado de UI só: não guarda dado
 * de negócio e não chama API. A mensagem já vem traduzida de quem chama.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<readonly Toast[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 0;

  readonly toasts = this.items.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timers.forEach((timer) => clearTimeout(timer)));
  }

  show(message: string, options: ToastOptions = {}): number {
    const tone = options.tone ?? 'info';
    const actions = options.actions ?? [];
    const toast: Toast = { id: ++this.nextId, message, tone, actions };
    const current = this.items();
    const overflow = current.slice(0, Math.max(0, current.length - MAX_VISIBLE + 1));
    overflow.forEach((old) => this.clearTimer(old.id));
    this.items.set([...current.slice(overflow.length), toast]);
    this.timers.set(
      toast.id,
      setTimeout(
        () => this.dismiss(toast.id),
        options.durationMs ?? (actions.length > 0 ? ACTION_DURATION : DEFAULT_DURATION[tone]),
      ),
    );
    return toast.id;
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this.items.update((list) => list.filter((toast) => toast.id !== id));
  }

  private clearTimer(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }
}
