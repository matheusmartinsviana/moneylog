import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { ToastService } from '~/app/common/services/toast.service';
import { OccurrenceRealizeFacade } from '~/modules/recurrences/core/facades/occurrence-realize.facade';
import type { RealizedTransaction } from '~/modules/recurrences/core/types/recurrence';
import { formatIsoDate } from '~/util/date';
import type { Money } from '~/util/money';

/** A ocorrência a realizar: o valor é o do modelo (editável) e a data é a da ocorrência. */
export interface RealizeTarget {
  readonly recurrenceId: string;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly amount: Money;
  readonly label: string;
  /** Compra no cartão? `null` quando a tela não sabe (o `/upcoming` não diz). */
  readonly viaCard: boolean | null;
}

/** Códigos em que a ocorrência já não está pendente: quem usa recarrega a lista. */
const STALE_CODES: ReadonlySet<string> = new Set([
  'RECURRENCE_OCCURRENCE_ALREADY_REALIZED',
  'RECURRENCE_OCCURRENCE_SKIPPED',
  'RECURRENCE_NOT_AN_OCCURRENCE',
  // Recorrência desativada ou encerrada em outro aparelho: a ocorrência saiu da agenda.
  'RECURRENCE_INACTIVE',
  'RECURRENCE_ENDED',
]);

const CODE_TO_FIELD: Readonly<Record<string, string>> = {
  TRANSACTION_AMOUNT_NOT_POSITIVE: 'amount',
  AMOUNT_ABOVE_LIMIT: 'amount',
};

/**
 * "Realizar" uma ocorrência (T88): confirma e cria a movimentação **na data da ocorrência**. O valor
 * começa com o do modelo e é editável (conta de luz). Para cartão, a fatura alvo é a que o backend
 * escolhe: vem na resposta (o aviso oferece "Ver fatura"). A `Idempotency-Key` é por tentativa e
 * reutilizada no "tentar de novo" (rede, 5xx, `409 CONFLICT`) e ao reabrir a folha; clique duplo = uma
 * requisição. `RECURRENCE_OCCURRENCE_ALREADY_REALIZED` mostra a mensagem e pede a recarga da lista.
 */
@Component({
  selector: 'app-realize-sheet',
  imports: [ReactiveFormsModule, SheetComponent, MoneyInputComponent],
  providers: [OccurrenceRealizeFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './realize-sheet.component.html',
  styleUrl: './realize-sheet.component.css',
})
export class RealizeSheetComponent {
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly t = this.i18n.t;
  protected readonly facade = inject(OccurrenceRealizeFacade);

  readonly open = input.required<boolean>();
  readonly target = input.required<RealizeTarget>();

  readonly closed = output<void>();
  /** A movimentação que nasceu (a resposta do backend). */
  readonly realized = output<RealizedTransaction>();
  /** A ocorrência já não está pendente (já realizada ou pulada): recarregue a lista. */
  readonly stale = output<void>();

  protected readonly form = new FormGroup({ amount: new FormControl<string | null>(null) });
  protected readonly heading = computed(() =>
    interpolate(this.t().recurrences.realize.title, { label: this.target().label }),
  );
  protected readonly dateText = computed(() =>
    formatIsoDate(this.target().date, HTML_LANG[this.i18n.language()], 'long'),
  );

  private readonly fieldHandled = signal(false);
  protected readonly banner = computed(() => {
    const problem = this.facade.problem();
    if (!problem || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });

  constructor() {
    // Abriu: o valor do modelo (editável). Uma falha ambígua da MESMA ocorrência continua pendente.
    effect(() => {
      const open = this.open();
      const target = this.target();
      untracked(() => {
        if (!open) return;
        this.facade.reopen(target.recurrenceId, target.date);
        this.form.reset({ amount: target.amount.amount });
      });
    });
    effect(() => {
      const problem = this.facade.problem();
      untracked(() => {
        this.fieldHandled.set(
          problem ? applyProblemToForm(this.form, problem, CODE_TO_FIELD) : false,
        );
        if (problem && STALE_CODES.has(problem.code)) this.stale.emit();
      });
    });
    this.facade.realized$.pipe(takeUntilDestroyed()).subscribe((transaction) => {
      const invoice = transaction.invoice;
      const card = transaction.card;
      this.toast.show(
        this.t().recurrences.realize.toast,
        invoice && card
          ? {
              actions: [
                {
                  id: 'invoice',
                  label: this.t().recurrences.realize.viewInvoice,
                  run: () => void this.router.navigate(['/cards', card.id, 'invoices', invoice.id]),
                },
              ],
            }
          : undefined,
      );
      this.realized.emit(transaction);
    });
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const target = this.target();
    const amount = this.form.controls.amount.value;
    // O mesmo valor do modelo vai como "sem valor" (o backend usa o do modelo); outro valor vai como digitado.
    this.facade.realize(
      target.recurrenceId,
      target.date,
      amount === null || amount === target.amount.amount ? null : amount,
    );
  }

  protected close(): void {
    if (!this.facade.saving()) this.closed.emit();
  }
}
