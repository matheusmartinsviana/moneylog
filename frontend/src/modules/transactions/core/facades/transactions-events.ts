import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * Aviso de que alguma movimentação mudou (criada, editada ou estornada). Quem exibe lista ou
 * totais (a lista, o painel de detalhe) escuta e recarrega **do backend**, em vez de ajustar a conta
 * por conta própria (FE 05: em caso de dúvida, recarregue).
 */
@Injectable({ providedIn: 'root' })
export class TransactionsEvents {
  private readonly subject = new Subject<void>();
  readonly changes$: Observable<void> = this.subject.asObservable();

  notifyChanged(): void {
    this.subject.next();
  }
}
