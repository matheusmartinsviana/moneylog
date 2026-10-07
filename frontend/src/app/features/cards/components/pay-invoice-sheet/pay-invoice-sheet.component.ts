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
import { RouterLink } from '@angular/router';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { ToastService } from '~/app/common/services/toast.service';
import type { Account } from '~/modules/accounts/core/types/account';
import { InvoicePaymentFacade } from '~/modules/cards/core/facades/invoice-payment.facade';
import { CARD_CURRENCY } from '~/modules/cards/core/types/card';
import type { Invoice, InvoiceSummary } from '~/modules/cards/core/types/invoice';
import { formatCompetenceShort, todayIso } from '~/util/date';
import { formatMoney, isPositive } from '~/util/money';

/** Códigos de regra que o backend atribui a um campo do formulário. */
const CODE_TO_FIELD: Readonly<Record<string, string>> = {
  TRANSACTION_ACCOUNT_NOT_CASH: 'accountId',
  ACCOUNT_ARCHIVED: 'accountId',
  ACCOUNT_NOT_FOUND: 'accountId',
  TRANSACTION_AMOUNT_NOT_POSITIVE: 'amount',
  AMOUNT_ABOVE_LIMIT: 'amount',
};

/**
 * "Pagar fatura" (T68): folha com conta, valor e data. O valor já vem com o `outstanding` que o backend
 * devolveu e a conta com a padrão do cartão; trocar a conta não recalcula nada. Ao digitar o valor, pede
 * a **prévia do backend** (300 ms, cancela a anterior): `PARTIAL` "restam R$ …", `OVERPAY` "R$ … viram
 * crédito na próxima fatura", `PREPAY` "pagamento antecipado" (os números são os recebidos). A prévia
 * é só informativa: um erro nela não impede de pagar. Data futura avisa "pagamento agendado" (S-130).
 * O envio leva uma `Idempotency-Key` por tentativa (reutilizada no "tentar de novo"); clique duplo é uma
 * requisição. Em sucesso emite a fatura da resposta. A folha prende o foco, `Esc` fecha sem enviar e o
 * foco volta ao botão que abriu (comportamento do `Sheet`).
 */
@Component({
  selector: 'app-pay-invoice-sheet',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    SheetComponent,
    SelectComponent,
    MoneyInputComponent,
    DatePickerComponent,
  ],
  providers: [InvoicePaymentFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pay-invoice-sheet.component.html',
  styleUrl: './pay-invoice-sheet.component.css',
})
export class PayInvoiceSheetComponent {
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;
  protected readonly facade = inject(InvoicePaymentFacade);
  protected readonly currency = CARD_CURRENCY;

  readonly open = input.required<boolean>();
  /** A fatura a pagar: o `outstanding` dela é a sugestão de valor (vem do backend). */
  readonly invoice = input<InvoiceSummary | null>(null);
  /** Contas `CASH` ativas que podem pagar. */
  readonly accounts = input.required<readonly Account[]>();
  /** Conta padrão do cartão (`defaultPaymentAccountId`). */
  readonly defaultAccountId = input<string | null>(null);

  /** A fatura devolvida pelo backend depois do pagamento. */
  readonly paid = output<Invoice>();
  readonly closed = output<void>();

  protected readonly form = new FormGroup({
    accountId: new FormControl<string | null>(null),
    amount: new FormControl<string | null>(null),
    date: new FormControl<string | null>(todayIso()),
  });

  protected readonly accountOptions = computed<readonly ChoiceOption[]>(() =>
    this.accounts().map((account) => ({ value: account.id, label: account.name })),
  );
  protected readonly heading = computed(() => {
    const invoice = this.invoice();
    return interpolate(this.t().cards.pay.title, {
      month: invoice
        ? formatCompetenceShort(invoice.referenceMonth, HTML_LANG[this.i18n.language()])
        : '',
    });
  });

  private readonly date = signal<string | null>(todayIso());
  /** Data de pagamento no futuro: "pagamento agendado" (S-130). */
  protected readonly scheduled = computed(() => {
    const date = this.date();
    return date !== null && date > todayIso();
  });

  private readonly fieldHandled = signal(false);
  protected readonly banner = computed(() => {
    const problem = this.facade.problem();
    if (!problem || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });

  protected readonly previewText = computed(() => {
    const preview = this.facade.previewData();
    if (!preview) return null;
    const copy = this.t().cards.pay.preview;
    switch (preview.kind) {
      case 'FULL':
        return copy.FULL;
      case 'PARTIAL':
        return interpolate(copy.PARTIAL, { amount: formatMoney(preview.outstandingAfter) });
      case 'OVERPAY':
        return interpolate(copy.OVERPAY, { amount: formatMoney(preview.creditCarryAfter) });
      case 'PREPAY':
        return copy.PREPAY;
    }
  });

  constructor() {
    // Abriu (ou trocou a fatura): valor = outstanding do backend, conta = padrão do cartão, data = hoje.
    effect(() => {
      const open = this.open();
      const invoice = this.invoice();
      untracked(() => {
        if (!open || !invoice) {
          this.facade.requestPreview(invoice?.id ?? '', null);
          return;
        }
        this.facade.reopen(invoice.id);
        // Sem saldo (ex.: fatura aberta com 0,00): o campo começa vazio em vez de sugerir "0,00".
        const suggested = isPositive(invoice.outstanding) ? invoice.outstanding.amount : null;
        this.form.reset({ accountId: this.initialAccount(), amount: suggested, date: todayIso() });
        this.date.set(todayIso());
        this.facade.requestPreview(invoice.id, suggested);
      });
    });
    // Valor digitado: pede a prévia do backend (o `null` de um valor inválido limpa).
    this.form.controls.amount.valueChanges.pipe(takeUntilDestroyed()).subscribe((amount) => {
      const invoice = this.invoice();
      if (invoice && this.open()) this.facade.requestPreview(invoice.id, amount);
    });
    this.form.controls.date.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((date) => this.date.set(date));
    // Falha do envio: marca o campo apontado; o resto vira o aviso do rodapé.
    effect(() => {
      const problem = this.facade.problem();
      untracked(() =>
        this.fieldHandled.set(
          problem ? applyProblemToForm(this.form, problem, CODE_TO_FIELD) : false,
        ),
      );
    });
    this.facade.paid$.pipe(takeUntilDestroyed()).subscribe((invoice) => {
      this.toast.show(this.t().cards.pay.toast);
      this.paid.emit(invoice);
    });
  }

  protected onSubmit(): void {
    const invoice = this.invoice();
    this.form.markAllAsTouched();
    if (!invoice || this.form.invalid) return;
    const value = this.form.getRawValue();
    this.facade.pay(invoice.id, {
      accountId: value.accountId ?? '',
      amount: value.amount ?? '',
      date: value.date ?? todayIso(),
    });
  }

  protected close(): void {
    if (!this.facade.saving()) this.closed.emit();
  }

  private initialAccount(): string | null {
    const preferred = this.defaultAccountId();
    const accounts = this.accounts();
    if (preferred && accounts.some((account) => account.id === preferred)) return preferred;
    return accounts.length === 1 ? (accounts[0]?.id ?? null) : null;
  }
}
