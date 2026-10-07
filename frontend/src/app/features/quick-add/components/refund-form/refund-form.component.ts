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

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { FormActionsComponent } from '~/app/features/quick-add/components/form-actions.component';
import { TransactionFormBase } from '~/app/features/quick-add/components/transaction-form.base';
import type { Account } from '~/modules/accounts/core/types/account';
import { ACCOUNT_CURRENCY } from '~/modules/accounts/core/types/account-input';
import type { Card } from '~/modules/cards/core/types/card';
import type { Category } from '~/modules/categories/core/types/category';
import type { Transaction } from '~/modules/transactions/core/types/transaction';
import type {
  RefundInput,
  TransactionInput,
} from '~/modules/transactions/core/types/transaction-input';
import { formatIsoDate, todayIso } from '~/util/date';

/** A despesa original já escolhida (na edição vem de `refundOf`). */
export interface RefundOrigin {
  readonly id: string;
  readonly description: string;
}

/**
 * Formulário de reembolso (presentational): valor → descrição (opcional) → despesa original
 * (opcional, busca por descrição) → categoria → conta (só `CASH`) → data. Com a original escolhida, a
 * categoria vem dela e **fica travada** (o domínio exige a mesma categoria, A19). A busca é de quem
 * usa: o formulário emite o texto (`originSearch`) e recebe os resultados (`originResults`). Com cartões
 * ativos (`cards`), oferece "Receber em" **conta ou cartão** (segmentado, nunca os dois, T70 CA4): no
 * cartão o reembolso vira crédito na fatura, e o corpo leva `cardId` sem `accountId`.
 */
@Component({
  selector: 'app-refund-form',
  imports: [
    ReactiveFormsModule,
    MoneyInputComponent,
    MoneyComponent,
    TextFieldComponent,
    SelectComponent,
    SegmentedControlComponent,
    DatePickerComponent,
    FormActionsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './refund-form.component.html',
  styleUrls: ['../entry-form.css', './refund-form.component.css'],
})
export class RefundFormComponent extends TransactionFormBase {
  private readonly i18n = inject(I18nService);

  readonly accounts = input.required<readonly Account[]>();
  /** Cartões ativos; vazio esconde a escolha "conta ou cartão". */
  readonly cards = input<readonly Card[]>([]);
  readonly defaultCardId = input<string | null>(null);
  readonly categories = input.required<readonly Category[]>();
  readonly initial = input<RefundInput | null>(null);
  /** A despesa original da edição (id e descrição de `refundOf`). */
  readonly initialOrigin = input<RefundOrigin | null>(null);
  readonly defaultAccountId = input<string | null>(null);
  /** `null`: nada buscado; lista (talvez vazia): resultado da última busca. */
  readonly originResults = input<readonly Transaction[] | null>(null);
  readonly originSearching = input(false);

  readonly originSearch = output<string>();

  protected readonly currency = ACCOUNT_CURRENCY;
  protected readonly form = new FormGroup({
    amount: new FormControl<string | null>(null),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
    originalSearch: new FormControl('', { nonNullable: true }),
    categoryId: new FormControl<string | null>(null),
    target: new FormControl<string | null>('account'),
    accountId: new FormControl<string | null>(null),
    cardId: new FormControl<string | null>({ value: null, disabled: true }),
    date: new FormControl<string | null>(todayIso()),
  });

  protected readonly origin = signal<RefundOrigin | null>(null);
  /** Para onde vai o reembolso: conta (padrão) ou crédito no cartão. */
  protected readonly target = signal<'account' | 'card'>('account');
  protected readonly showTarget = computed(
    () => this.cards().length > 0 && this.initial() === null,
  );
  protected readonly targetOptions = computed<readonly ChoiceOption[]>(() => {
    const copy = this.t().entryForm.refund;
    return [
      { value: 'account', label: copy.toAccount },
      { value: 'card', label: copy.toCard },
    ];
  });
  protected readonly cardOptions = computed<readonly ChoiceOption[]>(() =>
    this.cards().map((card) => ({ value: card.id, label: card.name })),
  );

  protected readonly accountOptions = computed<readonly ChoiceOption[]>(() =>
    this.accounts().map((account) => ({ value: account.id, label: account.name })),
  );
  protected readonly categoryOptions = computed<readonly ChoiceOption[]>(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );
  protected readonly descriptionHint = computed(() =>
    interpolate(this.t().entryForm.descriptionHint, { default: this.defaultDescription() }),
  );

  constructor() {
    super();
    this.form.controls.originalSearch.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((term) => this.originSearch.emit(term));
    effect(() => {
      const accountId = this.defaultAccountId();
      untracked(() => {
        const control = this.form.controls.accountId;
        if (accountId && control.value === null && this.initial() === null) {
          control.setValue(accountId);
        }
      });
    });
    effect(() => {
      const cardId = this.defaultCardId();
      untracked(() => {
        const control = this.form.controls.cardId;
        if (cardId && control.value === null && this.initial() === null) control.setValue(cardId);
      });
    });
    this.form.controls.target.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.setTarget(value === 'card' ? 'card' : 'account'));
    effect(() => {
      const initial = this.initial();
      if (!initial) return;
      untracked(() => {
        const onCard = initial.cardId !== null;
        this.form.setValue({
          amount: initial.amount,
          description: initial.description,
          originalSearch: '',
          categoryId: initial.categoryId,
          target: onCard ? 'card' : 'account',
          accountId: initial.accountId,
          cardId: initial.cardId,
          date: initial.date,
        });
        this.setTarget(onCard ? 'card' : 'account');
        this.setOrigin(this.initialOrigin());
      });
    });
  }

  protected dateOf(transaction: Transaction): string {
    return formatIsoDate(transaction.date, HTML_LANG[this.i18n.language()]);
  }

  /** Escolhe a despesa original: a categoria vem dela e fica travada. */
  protected choose(transaction: Transaction): void {
    this.setOrigin({ id: transaction.id, description: transaction.description });
    if (transaction.category) this.form.controls.categoryId.setValue(transaction.category.id);
    this.form.controls.originalSearch.reset('');
  }

  protected removeOrigin(): void {
    this.setOrigin(null);
  }

  protected build(): TransactionInput {
    const value = this.form.getRawValue();
    const onCard = this.target() === 'card';
    return {
      type: 'REFUND',
      amount: value.amount ?? '',
      date: value.date ?? todayIso(),
      description: value.description.trim() || this.defaultDescription(),
      notes: this.initial()?.notes ?? null,
      // Conta **ou** cartão, nunca os dois.
      accountId: onCard ? null : (value.accountId ?? ''),
      cardId: onCard ? (value.cardId ?? '') : null,
      categoryId: value.categoryId ?? '',
      refundOfTransactionId: this.origin()?.id ?? null,
    };
  }

  protected clearAfterSave(): void {
    this.form.controls.amount.reset(null);
    this.form.controls.description.reset('');
    this.form.controls.originalSearch.reset('');
    this.setOrigin(null);
  }

  private defaultDescription(): string {
    const copy = this.t().entryForm.refund;
    const origin = this.origin();
    return origin
      ? interpolate(copy.defaultDescriptionOf, { description: origin.description }).slice(0, 200)
      : copy.defaultDescription;
  }

  private setTarget(target: 'account' | 'card'): void {
    this.target.set(target);
    const { accountId, cardId } = this.form.controls;
    if (target === 'card') {
      accountId.disable({ emitEvent: false });
      cardId.enable({ emitEvent: false });
    } else {
      cardId.disable({ emitEvent: false });
      accountId.enable({ emitEvent: false });
    }
  }

  private setOrigin(origin: RefundOrigin | null): void {
    this.origin.set(origin);
    const category = this.form.controls.categoryId;
    if (origin) category.disable({ emitEvent: false });
    else category.enable({ emitEvent: false });
  }
}
