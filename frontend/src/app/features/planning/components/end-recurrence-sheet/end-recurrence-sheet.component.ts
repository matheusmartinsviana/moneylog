import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import type { Problem } from '~/util/api/problem';
import { todayIso } from '~/util/date';

/**
 * Encerrar uma recorrência numa data (T87 CA2): nada é apagado, só deixa de gerar ocorrências depois dela.
 * A data vem sugerida com o dia de hoje (a faixa válida, anterior ao início ou à última ocorrência
 * realizada ou pulada, é do backend: `RECURRENCE_INVALID`). Presentational.
 */
@Component({
  selector: 'app-end-recurrence-sheet',
  imports: [ReactiveFormsModule, SheetComponent, DatePickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet
      cy="end-sheet"
      [open]="open()"
      [heading]="t().recurrences.endSheet.title"
      [description]="t().recurrences.endSheet.description"
      [dismissable]="!busy()"
      (closed)="close()"
    >
      @if (open()) {
        <form class="form" [formGroup]="form" (ngSubmit)="onSubmit()" novalidate data-cy="end-form">
          <app-date-picker
            formControlName="date"
            fieldId="end-date"
            [label]="t().recurrences.endSheet.date"
          />
          @if (banner(); as message) {
            <p class="banner" role="alert" data-cy="end-error">{{ message }}</p>
          }
          <div class="actions">
            <button
              type="button"
              class="button"
              data-cy="end-cancel"
              [disabled]="busy()"
              (click)="close()"
            >
              {{ t().recurrences.endSheet.cancel }}
            </button>
            <button
              type="submit"
              class="button button--primary"
              data-cy="end-submit"
              [disabled]="busy()"
              [attr.aria-busy]="busy()"
            >
              {{ busy() ? t().recurrences.endSheet.submitting : t().recurrences.endSheet.submit }}
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
export class EndRecurrenceSheetComponent {
  protected readonly t = inject(I18nService).t;

  readonly open = input.required<boolean>();
  readonly busy = input(false);
  readonly problem = input<Problem | null>(null);

  readonly closed = output<void>();
  readonly confirmed = output<string>();

  protected readonly form = new FormGroup({ date: new FormControl<string | null>(todayIso()) });
  protected readonly banner = computed(() => {
    const problem = this.problem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });

  constructor() {
    effect(() => {
      if (this.open()) untracked(() => this.form.reset({ date: todayIso() }));
    });
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    const date = this.form.controls.date.value;
    if (this.form.invalid || date === null) return;
    this.confirmed.emit(date);
  }

  protected close(): void {
    if (!this.busy()) this.closed.emit();
  }
}
