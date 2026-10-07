import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { TextAreaComponent } from '~/app/common/components/forms/text-area/text-area.component';
import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import type { Reminder, ReminderInput } from '~/modules/notifications/core/types/notification';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Folha de criar/editar um lembrete (presentational): título, data, hora opcional e nota. */
@Component({
  selector: 'app-reminder-form',
  imports: [
    ReactiveFormsModule,
    SheetComponent,
    TextFieldComponent,
    DatePickerComponent,
    TextAreaComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet
      [open]="open()"
      [heading]="
        reminder()
          ? t().notifications.reminders.form.editTitle
          : t().notifications.reminders.form.addTitle
      "
      cy="reminder-form"
      (closed)="cancelled.emit()"
    >
      <form class="form" [formGroup]="form" (ngSubmit)="submit()" data-cy="reminder-form-form">
        <app-text-field
          formControlName="title"
          fieldId="reminder-title"
          [label]="t().notifications.reminders.form.title"
          [maxlength]="120"
        />
        <app-date-picker
          formControlName="remindOn"
          fieldId="reminder-date"
          [label]="t().notifications.reminders.form.date"
        />
        <app-text-field
          formControlName="remindAt"
          fieldId="reminder-time"
          [label]="t().notifications.reminders.form.time"
          [hint]="t().notifications.reminders.form.timeHint"
          [mandatory]="false"
          inputmode="numeric"
          [maxlength]="5"
        />
        <app-text-area
          formControlName="note"
          fieldId="reminder-note"
          [label]="t().notifications.reminders.form.note"
          [rows]="3"
          [maxlength]="500"
        />
        <div class="actions">
          <button
            type="submit"
            class="button button--primary"
            data-cy="reminder-save"
            [disabled]="busy()"
          >
            {{ t().notifications.reminders.form.save }}
          </button>
          <button type="button" class="button" data-cy="reminder-cancel" (click)="cancelled.emit()">
            {{ t().notifications.reminders.form.cancel }}
          </button>
        </div>
      </form>
    </app-sheet>
  `,
  styles: `
    .form {
      display: grid;
      gap: var(--space-4);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class ReminderFormComponent {
  protected readonly t = inject(I18nService).t;

  readonly open = input.required<boolean>();
  /** Lembrete em edição; `null` = novo. */
  readonly reminder = input<Reminder | null>(null);
  readonly busy = input(false);
  readonly saved = output<ReminderInput>();
  readonly cancelled = output<void>();

  protected readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    remindOn: new FormControl<string | null>(null, [Validators.required]),
    remindAt: new FormControl('', { nonNullable: true, validators: [Validators.pattern(TIME)] }),
    note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const current = this.reminder();
      untracked(() => {
        this.form.reset({
          title: current?.title ?? '',
          remindOn: current?.remindOn ?? null,
          remindAt: current?.remindAt ?? '',
          note: current?.note ?? '',
        });
      });
    });
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    const value = this.form.getRawValue();
    this.saved.emit({
      title: value.title,
      remindOn: value.remindOn ?? '',
      remindAt: value.remindAt === '' ? null : value.remindAt,
      note: value.note === '' ? null : value.note,
      link: this.reminder()?.link ?? null,
    });
  }
}
