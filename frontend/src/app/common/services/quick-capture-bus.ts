import { Injectable, signal } from '@angular/core';

export type CaptureRequestType = 'EXPENSE' | 'INCOME';

export interface CaptureRequest {
  readonly type: CaptureRequestType;
  /** Sobe a cada pedido (mesmo tipo duas vezes continua sendo um pedido novo). */
  readonly n: number;
}

/**
 * Pedido de "adicionar despesa/receita" feito pelas ações rápidas do cabeçalho: no Início, em vez de navegar,
 * o Quick Capture troca o tipo e recebe o foco no valor (plano 8.1). Fora do Início as ações seguem para
 * `/quick-add?mode=`. Não guarda dado de usuário.
 */
@Injectable({ providedIn: 'root' })
export class QuickCaptureBus {
  private readonly state = signal<CaptureRequest | null>(null);
  readonly request = this.state.asReadonly();

  open(type: CaptureRequestType): void {
    this.state.update((current) => ({ type, n: (current?.n ?? 0) + 1 }));
  }
}
