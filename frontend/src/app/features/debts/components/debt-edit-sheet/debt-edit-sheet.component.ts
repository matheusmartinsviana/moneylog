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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { requiredTrimmed } from '~/app/features/quick-add/components/requirements';
import type { Debt } from '~/modules/debts/core/types/debt';
import type { Problem } from '~/util/api/problem';

const CODE_TO_FIELD: Readonly<Record<string, string>> = {
  DEBT_DESCRIPTION_TOO_LONG: 'description',
  DEBT_FIELD_REQUIRED: 'description',
};

export interface DebtEdit {
  readonly description: string;
  readonly expectedDate: string | null;
}

/**
 * Editar a descrição e a previsão de uma dívida (presentational). O valor original não muda. `409
 * VERSION_CONFLICT`: quem usa já recarregou a dívida do backend; o formulário se repõe com a versão nova
 * e o aviso pede para revisar e salvar de novo.
 */
@Component({
  selector: 'app-debt-edit-sheet',
  imports: [ReactiveFormsModule, SheetComponent, TextFieldComponent, DatePickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet
      cy="debt-edit-sheet"
      [open]="open()"
      [heading]="t().debts.edit.title"
      [description]="t().debts.edit.description"
      [dismissable]="!busy()"
      (closed)="close()"
    >
      @if (open()) {
        <form
          class="form"
          [formGroup]="form"
          (ngSubmit)="onSubmit()"
          novalidate
          data-cy="debt-edit-form"
        >
          @if (conflict()) {
            <p class="banner" role="alert" data-cy="debt-edit-conflict">
              {{ t().debts.edit.conflict }}
            </p>
          }
          <app-text-field
            formControlName="description"
            fieldId="debt-edit-description"
            autocomplete="off"
            [maxlength]="200"
            [label]="t().debts.edit.descriptionField"
          />
          <app-date-picker
            formControlName="expectedDate"
            fieldId="debt-edit-expected-date"
            [mandatory]="false"
            [label]="t().debts.edit.expectedDate"
          />
          @if (banner(); as message) {
            <p class="banner" role="alert" data-cy="debt-edit-error">{{ message }}</p>
          }
          <div class="actions">
            <button
              type="button"
              class="button"
              data-cy="debt-edit-cancel"
              [disabled]="busy()"
              (click)="close()"
            >
              {{ t().debts.edit.cancel }}
            </button>
            <button
              type="submit"
              class="button button--primary"
              data-cy="debt-edit-save"
              [disabled]="busy()"
              [attr.aria-busy]="busy()"
            >
              {{ busy() ? t().debts.edit.saving : t().debts.edit.save }}
            </button>
          </div>
        </form>
      }
    </app-sheet>
  `,
  styles: `
    :host {
      display: contents;
    }

    .form {
      display: grid;
      gap: var(--space-4);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
})
export class DebtEditSheetComponent {
  protected readonly t = inject(I18nService).t;

  readonly open = input.required<boolean>();
  readonly debt = input.required<Debt>();
  readonly busy = input(false);
  readonly problem = input<Problem | null>(null);

  readonly closed = output<void>();
  readonly saved = output<DebtEdit>();

  protected readonly form = new FormGroup({
    description: new FormControl('', {
      nonNullable: true,
      validators: [requiredTrimmed, Validators.maxLength(200)],
    }),
    expectedDate: new FormControl<string | null>(null),
  });

  private readonly fieldHandled = signal(false);
  protected readonly conflict = computed(() => this.problem()?.code === 'VERSION_CONFLICT');
  protected readonly banner = computed(() => {
    const problem = this.problem();
    if (!problem || problem.code === 'VERSION_CONFLICT' || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });

  constructor() {
    // Abriu (ou chegou uma versão nova, depois de um conflito): o formulário se repõe com a dívida.
    effect(() => {
      const open = this.open();
      const debt = this.debt();
      untracked(() => {
        if (open) {
          this.form.reset({
            description: debt.description ?? '',
            expectedDate: debt.expectedDate,
          });
        }
      });
    });
    effect(() => {
      const problem = this.problem();
      untracked(() =>
        this.fieldHandled.set(
          problem ? applyProblemToForm(this.form, problem, CODE_TO_FIELD) : false,
        ),
      );
    });
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    this.saved.emit({ description: value.description.trim(), expectedDate: value.expectedDate });
  }

  protected close(): void {
    if (!this.busy()) this.closed.emit();
  }
}
