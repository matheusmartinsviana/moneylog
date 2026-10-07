import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { distinctUntilChanged, map } from 'rxjs';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { NumberStepperComponent } from '~/app/common/components/forms/number-stepper/number-stepper.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { interpolate } from '~/app/common/i18n/interpolate';
import { FormActionsComponent } from '~/app/features/quick-add/components/form-actions.component';
import { PurchasePreviewComponent } from '~/app/features/quick-add/components/purchase-preview/purchase-preview.component';
import { TransactionFormBase } from '~/app/features/quick-add/components/transaction-form.base';
import type { Card } from '~/modules/cards/core/types/card';
import { CARD_CURRENCY } from '~/modules/cards/core/types/card';
import {
  PURCHASE_MAX_INSTALLMENTS,
  type PurchasePreview,
  type PurchasePreviewRequest,
} from '~/modules/cards/core/types/purchase-preview';
import type { Category } from '~/modules/categories/core/types/category';
import type {
  CardPurchaseInput,
  TransactionInput,
} from '~/modules/transactions/core/types/transaction-input';
import type { Problem } from '~/util/api/problem';
import { isIsoDate, todayIso } from '~/util/date';

/** O que a tela pede ao backend para a prévia: o cartão e o corpo (`null` = dados incompletos). */
export interface PurchasePreviewQuery {
  readonly cardId: string;
  readonly request: PurchasePreviewRequest;
}

/**
 * Formulário da compra no cartão (T67, presentational): cartão → valor total → descrição → categoria →
 * data → parcelas (`NumberStepper` de 1 a 36), com a **prévia do backend** logo abaixo (parcelas, fatura
 * alvo, avisos, limite depois). Emite `previewRequest` quando cartão, valor, parcelas e data estão
 * válidos (quem usa pede a prévia, com espera e cancelamento) e a entrada pronta em `submitted`. O
 * front nunca calcula parcela nem fatura. Sem `accountId`: a compra vai para a fatura. Na edição
 * (`initial`), só descrição, categoria e observação mudam (S-121): cartão, valor, data e parcelas ficam
 * em leitura, com a dica de como corrigir.
 */
@Component({
  selector: 'app-card-purchase-form',
  imports: [
    ReactiveFormsModule,
    MoneyInputComponent,
    TextFieldComponent,
    SelectComponent,
    DatePickerComponent,
    NumberStepperComponent,
    FormActionsComponent,
    PurchasePreviewComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './card-purchase-form.component.html',
  styleUrl: '../entry-form.css',
})
export class CardPurchaseFormComponent extends TransactionFormBase {
  readonly cards = input.required<readonly Card[]>();
  readonly categories = input.required<readonly Category[]>();
  readonly initial = input<CardPurchaseInput | null>(null);
  /** Nome do cartão da compra editada (pode estar arquivado e fora de `cards`). */
  readonly initialCardName = input<string | null>(null);
  readonly defaultCardId = input<string | null>(null);
  readonly preview = input<PurchasePreview | null>(null);
  readonly previewLoading = input(false);
  readonly previewProblem = input<Problem | null>(null);

  readonly previewRequest = output<PurchasePreviewQuery | null>();

  protected readonly currency = CARD_CURRENCY;
  protected readonly maxInstallments = PURCHASE_MAX_INSTALLMENTS;
  protected readonly form = new FormGroup({
    cardId: new FormControl<string | null>(null),
    amount: new FormControl<string | null>(null),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(200)],
    }),
    categoryId: new FormControl<string | null>(null),
    date: new FormControl<string | null>(todayIso()),
    installments: new FormControl<number | null>(1),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
  });

  protected readonly editing = computed(() => this.initial() !== null);
  protected readonly cardOptions = computed<readonly ChoiceOption[]>(() => {
    const options = this.cards().map((card) => ({ value: card.id, label: card.name }));
    const initial = this.initial();
    const name = this.initialCardName();
    return initial && name && !options.some((option) => option.value === initial.cardId)
      ? [{ value: initial.cardId, label: name }, ...options]
      : options;
  });
  protected readonly categoryOptions = computed<readonly ChoiceOption[]>(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );
  protected readonly installmentsText = computed(() => (count: number): string => {
    const copy = this.t().cards.purchase;
    return count === 1
      ? copy.installmentsOne
      : interpolate(copy.installmentsMany, { count: String(count) });
  });

  constructor() {
    super();
    // Cartão padrão (o último usado, o único ou o pedido na URL), só enquanto o campo está vazio.
    effect(() => {
      const cardId = this.defaultCardId();
      untracked(() => {
        const control = this.form.controls.cardId;
        if (cardId && control.value === null && this.initial() === null) control.setValue(cardId);
      });
    });
    // Edição: o valor inicial (e cada versão nova, depois de um conflito) repõe o formulário.
    effect(() => {
      const initial = this.initial();
      if (!initial) return;
      untracked(() => {
        this.form.setValue({
          cardId: initial.cardId,
          amount: initial.amount,
          description: initial.description,
          categoryId: initial.categoryId,
          date: initial.date,
          installments: initial.installments,
          notes: initial.notes ?? '',
        });
        for (const name of ['cardId', 'amount', 'date', 'installments'] as const) {
          this.form.controls[name].disable({ emitEvent: false });
        }
      });
    });
    // Cartão, valor, parcelas ou data mudaram: pede a prévia (ou limpa, se faltam dados).
    // Só a combinação cartão + valor + data + parcelas conta: descrição, categoria e observações não
    // refazem a prévia (nem a fazem piscar "calculando").
    this.form.valueChanges
      .pipe(
        map(() => {
          const { cardId, amount, date, installments } = this.form.getRawValue();
          return JSON.stringify([cardId, amount, date, installments]);
        }),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.emitPreview());
  }

  protected build(): TransactionInput {
    const value = this.form.getRawValue();
    const notes = value.notes.trim();
    const initial = this.initial();
    return {
      type: 'CARD_PURCHASE',
      amount: value.amount ?? '',
      date: value.date ?? todayIso(),
      description: value.description.trim(),
      notes: initial ? (notes === '' ? null : notes) : null,
      cardId: value.cardId ?? '',
      categoryId: value.categoryId ?? '',
      installments: value.installments ?? 1,
    };
  }

  protected clearAfterSave(): void {
    this.form.controls.amount.reset(null);
    this.form.controls.description.reset('');
    this.form.controls.installments.reset(1);
  }

  private emitPreview(): void {
    if (this.initial() !== null) return;
    const { cardId, amount, date, installments } = this.form.getRawValue();
    const valid =
      cardId !== null &&
      amount !== null &&
      date !== null &&
      isIsoDate(date) &&
      installments !== null &&
      Number.isInteger(installments) &&
      installments >= 1 &&
      installments <= PURCHASE_MAX_INSTALLMENTS;
    this.previewRequest.emit(valid ? { cardId, request: { amount, installments, date } } : null);
  }
}
