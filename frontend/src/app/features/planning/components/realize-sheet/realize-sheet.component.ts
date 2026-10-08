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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { ToastService } from '~/app/common/services/toast.service';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import { OccurrenceRealizeFacade } from '~/modules/recurrences/core/facades/occurrence-realize.facade';
import type {
  RealizedTransaction,
  RecurrenceMethod,
} from '~/modules/recurrences/core/types/recurrence';
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
  /**
   * Recorrência "a definir" (2.14.0): pede a conta e o meio de pagamento. `undefined` quando a tela não sabe
   * (o `/upcoming` não diz): o backend responde `RECURRENCE_ACCOUNT_REQUIRED` e a folha passa a pedir.
   */
  readonly accountToDefine?: boolean;
}

/** Meios de pagamento de uma recorrência em conta. */
const PAYMENT_METHODS: readonly RecurrenceMethod[] = [
  'PIX',
  'DEBIT',
  'TRANSFER',
  'BOLETO',
  'CASH',
  'OTHER',
];

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
  RECURRENCE_ACCOUNT_REQUIRED: 'accountId',
  ACCOUNT_NOT_FOUND: 'accountId',
  ACCOUNT_ARCHIVED: 'accountId',
  TRANSACTION_ACCOUNT_NOT_CASH: 'accountId',
  TRANSACTION_PAYMENT_METHOD_REQUIRED: 'method',
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
  imports: [ReactiveFormsModule, SheetComponent, MoneyInputComponent, SelectComponent],
  providers: [OccurrenceRealizeFacade, AccountsListFacade],
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
  private readonly accounts = inject(AccountsListFacade);

  readonly open = input.required<boolean>();
  readonly target = input.required<RealizeTarget>();

  readonly closed = output<void>();
  /** A movimentação que nasceu (a resposta do backend). */
  readonly realized = output<RealizedTransaction>();
  /** A ocorrência já não está pendente (já realizada ou pulada): recarregue a lista. */
  readonly stale = output<void>();

  protected readonly form = new FormGroup({
    amount: new FormControl<string | null>(null),
    accountId: new FormControl<string | null>({ value: null, disabled: true }, [
      Validators.required,
    ]),
    method: new FormControl<string | null>({ value: null, disabled: true }, [Validators.required]),
  });
  /** A recorrência não tem conta: a conta e o meio são obrigatórios para confirmar. */
  protected readonly needsAccount = signal(false);
  protected readonly accountOptions = computed<readonly ChoiceOption[]>(() =>
    (this.accounts.data() ?? [])
      .filter((account) => account.liquidity === 'CASH')
      .map((account) => ({ value: account.id, label: account.name })),
  );
  protected readonly methodOptions = computed<readonly ChoiceOption[]>(() =>
    PAYMENT_METHODS.map((method) => ({
      value: method,
      label: this.t().transactions.methods[method],
    })),
  );
  protected readonly noAccounts = computed(
    () => this.accounts.state().status === 'ready' && this.accountOptions().length === 0,
  );
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
        this.form.reset({ amount: target.amount.amount, accountId: null, method: null });
        this.requireAccount(target.accountToDefine === true);
      });
    });
    effect(() => {
      const problem = this.facade.problem();
      untracked(() => {
        // O backend pediu a conta (a tela não sabia): passa a pedir e deixa o erro no campo.
        if (problem?.code === 'RECURRENCE_ACCOUNT_REQUIRED') this.requireAccount(true);
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

  /** Conta e meio só valem (e só são validados) quando a recorrência não tem conta. */
  private requireAccount(needs: boolean): void {
    this.needsAccount.set(needs);
    const { accountId, method } = this.form.controls;
    if (needs) {
      accountId.enable({ emitEvent: false });
      method.enable({ emitEvent: false });
      this.accounts.load('ACTIVE');
    } else {
      accountId.disable({ emitEvent: false });
      method.disable({ emitEvent: false });
    }
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const target = this.target();
    const amount = this.form.controls.amount.value;
    const { accountId, method } = this.form.getRawValue();
    // O mesmo valor do modelo vai como "sem valor" (o backend usa o do modelo); outro valor vai como digitado.
    this.facade.realize(
      target.recurrenceId,
      target.date,
      amount === null || amount === target.amount.amount ? null : amount,
      this.needsAccount() && accountId !== null && method !== null
        ? { accountId, method: method as RecurrenceMethod }
        : null,
    );
  }

  protected close(): void {
    if (!this.facade.saving()) this.closed.emit();
  }
}
