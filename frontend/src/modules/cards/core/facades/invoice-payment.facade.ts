import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, Observable, of, Subject, tap } from 'rxjs';

import { DebouncedPreview } from '~/modules/cards/core/facades/debounced-preview';
import { CardsGateway } from '~/modules/cards/core/interfaces/cards.gateway';
import type {
  Invoice,
  InvoicePaymentInput,
  PaymentPreview,
} from '~/modules/cards/core/types/invoice';
import { newIdempotencyKey } from '~/util/api/idempotency-key';
import { Problem, problemOf } from '~/util/api/problem';

interface Attempt {
  readonly invoiceId: string;
  readonly input: InvoicePaymentInput;
  readonly key: string;
}

interface PreviewKey {
  readonly invoiceId: string;
  readonly amount: string;
}

/** Falha em que repetir o mesmo envio é seguro e útil: sem resposta (rede) ou erro do servidor. */
export function isRetryablePayment(problem: Problem | null): boolean {
  return (
    problem !== null &&
    (problem.status === 0 || problem.status >= 500 || problem.code === 'CONFLICT')
  );
}

/**
 * Facade do pagamento de fatura (T68). O envio gera a `Idempotency-Key` **por tentativa** e a reutiliza
 * no `retry()` depois de um erro de rede; um envio novo gera chave nova (como T35 CA1), exceto se a
 * tentativa anterior ficou pendente por falha ambígua com os mesmos dados (aí reaproveita a chave, mesmo
 * depois de fechar e reabrir a folha). `exhaustMap`:
 * clique duplo = uma requisição. A resposta (a fatura atualizada) é emitida em `paid$` e é a fonte da
 * verdade. A prévia (`kind`, `outstandingAfter`, `creditCarryAfter`) vem do backend com espera de
 * 300 ms e é só informativa: um erro nela não impede o pagamento. Nenhuma subtração no front.
 * Escopo de componente.
 */
@Injectable()
export class InvoicePaymentFacade {
  private readonly gateway = inject(CardsGateway);
  private readonly attempts = new Subject<Attempt>();
  private readonly paidEvents = new Subject<Invoice>();
  private readonly savingState = signal(false);
  private readonly problemState = signal<Problem | null>(null);
  private last: Attempt | null = null;
  private readonly preview = new DebouncedPreview<PreviewKey, PaymentPreview>((key) =>
    this.gateway.previewPayment(key.invoiceId, key.amount),
  );

  readonly saving = this.savingState.asReadonly();
  readonly problem = this.problemState.asReadonly();
  readonly canRetry = computed(() => isRetryablePayment(this.problemState()));
  /** Emite a fatura devolvida pela API quando o pagamento dá certo. */
  readonly paid$ = this.paidEvents.asObservable();

  readonly previewState = this.preview.state;
  readonly previewData = this.preview.data;
  readonly previewLoading = this.preview.loading;

  constructor() {
    this.attempts
      .pipe(
        exhaustMap((attempt) => {
          this.savingState.set(true);
          this.problemState.set(null);
          return this.send(attempt).pipe(
            tap((invoice) => {
              this.last = null;
              this.paidEvents.next(invoice);
            }),
            map(() => null),
            catchError((error: unknown) => of(problemOf(error))),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.savingState.set(false);
        // Só uma falha ambígua (rede, 5xx, CONFLICT) deixa a tentativa pendente: o servidor pode ter
        // gravado. Uma recusa definitiva (4xx) libera a chave.
        if (!isRetryablePayment(problem)) this.last = null;
        this.problemState.set(problem);
      });
  }

  /**
   * Novo envio. Se a tentativa anterior ficou pendente por falha ambígua (resposta perdida) e a fatura
   * e os dados são os mesmos, reaproveita a **mesma** chave (o backend devolve o pagamento já feito em
   * vez de gravar outro); com dados diferentes ou depois de um sucesso, a chave é nova.
   */
  pay(invoiceId: string, input: InvoicePaymentInput): void {
    const pending = this.last;
    const same =
      pending !== null &&
      pending.invoiceId === invoiceId &&
      pending.input.accountId === input.accountId &&
      pending.input.amount === input.amount &&
      pending.input.date === input.date;
    const attempt: Attempt = {
      invoiceId,
      input,
      key: same ? pending.key : newIdempotencyKey(),
    };
    this.last = attempt;
    this.attempts.next(attempt);
  }

  /** "Tentar de novo" depois de um erro de rede: o mesmo comando com a **mesma** chave. */
  retry(): void {
    if (this.last) this.attempts.next(this.last);
  }

  /**
   * A folha (re)abriu para `invoiceId`. Uma falha ambígua da **mesma** fatura continua pendente (com o
   * aviso e o "tentar de novo"): fechar e reabrir não zera a chave. Qualquer outra falha é descartada.
   */
  reopen(invoiceId: string): void {
    if (this.last?.invoiceId === invoiceId && isRetryablePayment(this.problemState())) return;
    this.last = null;
    this.problemState.set(null);
  }

  /** Valor digitado; `null` (vazio ou inválido) limpa a prévia sem pedir nada. */
  requestPreview(invoiceId: string, amount: string | null): void {
    this.preview.request(amount === null ? null : { invoiceId, amount });
  }

  private send({ invoiceId, input, key }: Attempt): Observable<Invoice> {
    return this.gateway.payInvoice(invoiceId, input, key);
  }
}
