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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { startWith } from 'rxjs';

import { FormModalComponent } from '~/app/common/components/form-modal/form-modal.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import { NumberStepperComponent } from '~/app/common/components/forms/number-stepper/number-stepper.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { dirtySignal } from '~/app/common/forms/dirty-signal';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { ToastService } from '~/app/common/services/toast.service';
import { CardsListFacade } from '~/modules/cards/core/facades/cards-list.facade';
import { OngoingInstallmentsFacade } from '~/modules/debt-overview/core/facades/ongoing-installments.facade';
import {
  DEBT_OVERVIEW_CURRENCY,
  type OngoingInstallmentsInput,
} from '~/modules/debt-overview/core/types/debt-overview';
import { formatIsoDate } from '~/util/date';
import { formatMoney } from '~/util/money';

/** Códigos de regra do backend → campo do formulário. */
const CODE_TO_FIELD: Readonly<Record<string, string>> = {
  ONGOING_INVALID_COUNT: 'remainingInstallments',
  ONGOING_FIRST_INVOICE_NOT_PAYABLE: 'firstInvoiceDate',
  ONGOING_CATEGORY_RETROACTIVE: 'firstInvoiceDate',
  CARD_ARCHIVED: 'cardId',
  CARD_NOT_FOUND: 'cardId',
};

const MAX_INSTALLMENTS = 36;

/**
 * Cadastro da compra parcelada em andamento (modal, smart): cartão, descrição, valor de cada parcela,
 * parcelas no total e quantas **faltam pagar** ("3 de 10" = 8). A prévia ("Faltam R$ 1.200,00 em 8
 * parcelas, até 06/2027") vem do **servidor**: o front não soma parcelas. Salvar usa `exhaustMap` (sem
 * idempotência no contrato) e o botão fica desabilitado durante o envio. Erros 422 vão para o campo.
 */
@Component({
  selector: 'app-ongoing-installments-modal',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    FormModalComponent,
    SelectComponent,
    TextFieldComponent,
    MoneyInputComponent,
    NumberStepperComponent,
    DatePickerComponent,
  ],
  providers: [OngoingInstallmentsFacade, CardsListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-form-modal
      #modal
      [heading]="t().debtOverview.ongoing.title"
      [dirty]="dirty()"
      [busy]="facade.saving()"
      (closed)="closed.emit()"
    >
      @if (cardsStatus() === 'empty') {
        <div class="empty" data-cy="ongoing-no-cards">
          <p>{{ t().debtOverview.ongoing.noCards }}</p>
          <a class="button button--primary" routerLink="/cards/new" data-cy="ongoing-add-card">
            {{ t().debtOverview.ongoing.addCard }}
          </a>
        </div>
      } @else {
        <form
          class="form"
          [formGroup]="form"
          (ngSubmit)="onSubmit()"
          novalidate
          data-cy="ongoing-form"
        >
          <p class="hint" data-cy="ongoing-description">
            {{ t().debtOverview.ongoing.description }}
          </p>
          @if (banner(); as message) {
            <p class="banner" role="alert" data-cy="ongoing-error">{{ message }}</p>
          }
          @if (!cardPreset()) {
            <app-select
              formControlName="cardId"
              fieldId="ongoing-card"
              [options]="cardOptions()"
              [label]="t().debtOverview.ongoing.card"
            />
          }
          <app-text-field
            formControlName="description"
            fieldId="ongoing-description-field"
            autocomplete="off"
            [maxlength]="200"
            [label]="t().debtOverview.ongoing.descriptionField"
          />
          <app-money-input
            formControlName="installmentAmount"
            fieldId="ongoing-installment-amount"
            [currency]="currency"
            [label]="t().debtOverview.ongoing.installmentAmount"
          />
          <div class="pair">
            <app-number-stepper
              formControlName="totalInstallments"
              fieldId="ongoing-total"
              [min]="2"
              [max]="maxInstallments"
              [label]="t().debtOverview.ongoing.totalInstallments"
            />
            <app-number-stepper
              formControlName="remainingInstallments"
              fieldId="ongoing-remaining"
              [min]="1"
              [max]="maxInstallments"
              [label]="t().debtOverview.ongoing.remainingInstallments"
            />
          </div>
          <p class="hint" data-cy="ongoing-remaining-hint">
            {{ t().debtOverview.ongoing.remainingHint }}
          </p>
          <app-date-picker
            formControlName="firstInvoiceDate"
            fieldId="ongoing-first-invoice-date"
            [mandatory]="false"
            [label]="t().debtOverview.ongoing.firstInvoiceDate"
            [hint]="t().debtOverview.ongoing.firstInvoiceHint"
          />

          @if (facade.previewLoading()) {
            <p class="hint" role="status" data-cy="ongoing-preview-loading">
              {{ t().debtOverview.ongoing.preview.loading }}
            </p>
          } @else if (facade.preview(); as preview) {
            <div class="preview surface" role="status" data-cy="ongoing-preview">
              <p class="preview__title">{{ t().debtOverview.ongoing.preview.title }}</p>
              <p class="preview__text" data-cy="ongoing-preview-text">{{ previewText() }}</p>
              <p class="hint">{{ t().debtOverview.ongoing.preview.note }}</p>
            </div>
          } @else if (previewProblem(); as message) {
            <p class="banner" role="alert" data-cy="ongoing-preview-error">{{ message }}</p>
          }

          <div class="actions">
            <button
              type="button"
              class="button"
              data-cy="ongoing-cancel"
              (click)="modal.requestClose()"
            >
              {{ t().debtOverview.ongoing.cancel }}
            </button>
            <button
              type="submit"
              class="button button--primary"
              data-cy="ongoing-save"
              [disabled]="facade.saving()"
              [attr.aria-busy]="facade.saving()"
            >
              {{
                facade.saving() ? t().debtOverview.ongoing.saving : t().debtOverview.ongoing.save
              }}
            </button>
          </div>
        </form>
      }
    </app-form-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .form,
    .empty {
      display: grid;
      gap: var(--space-4);
    }

    .pair {
      display: grid;
      gap: var(--space-4);
    }

    .hint {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .preview {
      display: grid;
      gap: var(--space-1);
      padding: var(--space-4);
    }

    .preview__title {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .preview__text {
      margin: 0;
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-2);
    }

    @media (width >= 480px) {
      .pair {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
})
export class OngoingInstallmentsModalComponent {
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly cards = inject(CardsListFacade);
  protected readonly t = this.i18n.t;
  protected readonly facade = inject(OngoingInstallmentsFacade);
  protected readonly currency = DEBT_OVERVIEW_CURRENCY;
  protected readonly maxInstallments = MAX_INSTALLMENTS;

  /** Cartão já escolhido (detalhe do cartão): o seletor some. */
  readonly cardId = input<string | null>(null);

  readonly closed = output<void>();
  /** Compra criada: quem usa recarrega do backend. */
  readonly saved = output<void>();

  protected readonly cardPreset = computed(() => this.cardId() !== null);
  protected readonly form = new FormGroup({
    cardId: new FormControl<string | null>(null, [Validators.required]),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    installmentAmount: new FormControl<string | null>(null),
    totalInstallments: new FormControl<number | null>(null, [Validators.required]),
    remainingInstallments: new FormControl<number | null>(null, [Validators.required]),
    firstInvoiceDate: new FormControl<string | null>(null),
  });
  protected readonly dirty = dirtySignal(this.form);

  protected readonly cardsStatus = computed(() => this.cards.state().status);
  protected readonly cardOptions = computed<readonly ChoiceOption[]>(() =>
    (this.cards.data() ?? []).map((card) => ({ value: card.id, label: card.name })),
  );

  private readonly values = toSignal(this.form.valueChanges.pipe(startWith(this.form.value)), {
    initialValue: this.form.value,
  });
  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);

  protected readonly previewText = computed(() => {
    const preview = this.facade.preview();
    if (!preview) return '';
    return interpolate(this.t().debtOverview.ongoing.preview.text, {
      remaining: formatMoney(preview.remaining),
      count: String(preview.remainingInstallments),
      date: formatIsoDate(preview.lastDueDate, this.locale(), 'long'),
    });
  });
  protected readonly previewProblem = computed(() => {
    const problem = this.facade.previewProblem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });

  private readonly fieldHandled = signal(false);
  protected readonly banner = computed(() => {
    const problem = this.facade.problem();
    if (!problem || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });

  constructor() {
    this.cards.load('ACTIVE');
    effect(() => {
      const preset = this.cardId();
      untracked(() => {
        if (preset !== null) this.form.controls.cardId.setValue(preset);
      });
    });
    // Dados completos pedem a prévia ao servidor (300 ms, cancela a anterior); incompletos limpam.
    effect(() => {
      const input = this.toInput(this.values());
      const cardId = this.values().cardId ?? null;
      untracked(() =>
        this.facade.requestPreview(cardId ?? '', cardId !== null && input !== null ? input : null),
      );
    });
    effect(() => {
      const problem = this.facade.problem();
      untracked(() =>
        this.fieldHandled.set(
          problem ? applyProblemToForm(this.form, problem, CODE_TO_FIELD) : false,
        ),
      );
    });
    this.facade.saved$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.toast.show(this.t().debtOverview.ongoing.toast);
      this.saved.emit();
    });
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    const input = this.toInput(this.form.getRawValue());
    const cardId = this.form.controls.cardId.value;
    if (this.form.invalid || input === null || cardId === null) return;
    this.facade.save(cardId, input);
  }

  private toInput(
    value: Partial<ReturnType<typeof this.form.getRawValue>>,
  ): OngoingInstallmentsInput | null {
    const amount = value.installmentAmount ?? '';
    const description = (value.description ?? '').trim();
    if (
      amount === '' ||
      description === '' ||
      !value.totalInstallments ||
      !value.remainingInstallments
    ) {
      return null;
    }
    return {
      description,
      installmentAmount: amount,
      totalInstallments: value.totalInstallments,
      remainingInstallments: value.remainingInstallments,
      firstInvoiceDate: value.firstInvoiceDate ?? null,
    };
  }
}
