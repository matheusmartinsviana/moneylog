import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

/** Quantas leituras do razão o Início deixa em voo ao mesmo tempo (R13, ADR-008). */
export const LEDGER_MAX_IN_FLIGHT = 2;

interface Job {
  readonly priority: number;
  readonly order: number;
  readonly start: () => void;
}

/**
 * Porteiro das leituras do razão (R13): cada leitura (dashboard, resumo mensal, relatórios) custa 1,7 a 2,0 s e
 * ~120 MB no backend com 50.000 movimentações (ADR-008), então o Início as roda **por prioridade e no máximo
 * `maxInFlight` por vez**, em vez de disparar todas juntas. A fonte só é assinada quando há vaga; sai da fila
 * (sem nunca ser assinada) se o assinante cancelar antes; e a vaga volta quando a leitura completa, falha ou é
 * cancelada. Menor `priority` vai primeiro; empate sai na ordem de chegada. Não toca nos valores.
 */
export class LedgerGate {
  private active = 0;
  private counter = 0;
  private readonly queue: Job[] = [];

  constructor(readonly maxInFlight: number = LEDGER_MAX_IN_FLIGHT) {}

  /** Quantas leituras estão em voo agora (para os testes). */
  get inFlight(): number {
    return this.active;
  }

  /** Quantas esperam vaga (para os testes). */
  get waiting(): number {
    return this.queue.length;
  }

  run<T>(source: Observable<T>, priority = 0): Observable<T> {
    return new Observable<T>((subscriber) => {
      let running = false;
      let released = false;
      const release = (): void => {
        if (!running || released) return;
        released = true;
        this.active--;
        this.drain();
      };
      const job: Job = {
        priority,
        order: this.counter++,
        start: () => {
          running = true;
          this.active++;
          const inner = source.subscribe({
            next: (value) => subscriber.next(value),
            error: (error: unknown) => {
              release();
              subscriber.error(error);
            },
            complete: () => {
              release();
              subscriber.complete();
            },
          });
          subscriber.add(inner);
        },
      };
      this.enqueue(job);
      return () => {
        const index = this.queue.indexOf(job);
        if (index >= 0) this.queue.splice(index, 1);
        release();
      };
    });
  }

  private enqueue(job: Job): void {
    this.queue.push(job);
    this.queue.sort((a, b) => a.priority - b.priority || a.order - b.order);
    this.drain();
  }

  private drain(): void {
    while (this.active < this.maxInFlight && this.queue.length > 0) {
      this.queue.shift()!.start();
    }
  }
}

/** Fornecido pela página do Início; fora dela (`null`) as leituras vão direto, sem fila. */
export const LEDGER_GATE = new InjectionToken<LedgerGate>('LEDGER_GATE');
