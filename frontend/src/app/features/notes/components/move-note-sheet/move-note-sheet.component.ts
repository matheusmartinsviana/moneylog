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
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { requiredTrimmed } from '~/app/features/quick-add/components/requirements';
import { pathProblem } from '~/modules/notes/core/types/note-path';
import type { Problem } from '~/util/api/problem';

/**
 * "Renomear ou mover": o novo caminho `.md`. O backend reescreve, na mesma transação, os `[[wikilinks]]` das
 * outras notas que apontavam para esta; a tela mostra depois quantas notas mudaram. Com texto não salvo o
 * botão fica desabilitado **com a razão** ("Salve as alterações antes de renomear"). O caminho é conferido aqui
 * só para avisar cedo (o backend é a verdade: `NOTE_PATH_INVALID`, `NOTE_PATH_TAKEN`). Presentational.
 */
@Component({
  selector: 'app-move-note-sheet',
  imports: [ReactiveFormsModule, SheetComponent, TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet
      cy="move-note-sheet"
      [open]="open()"
      [heading]="t().notes.editor.move.title"
      [description]="t().notes.editor.move.description"
      [dismissable]="!busy()"
      (closed)="close()"
    >
      @if (open()) {
        <form
          class="form"
          [formGroup]="form"
          (ngSubmit)="onSubmit()"
          novalidate
          data-cy="move-form"
        >
          <app-text-field
            formControlName="path"
            fieldId="move-path"
            [label]="t().notes.editor.move.pathLabel"
            [hint]="t().notes.editor.move.pathHint"
            [maxlength]="255"
            data-autofocus
          />
          @if (dirty()) {
            <p class="note" role="status" data-cy="move-save-first">
              {{ t().notes.editor.move.saveFirst }}
            </p>
          }
          @if (banner(); as message) {
            <p class="banner" role="alert" data-cy="move-error">{{ message }}</p>
          }
          <div class="actions">
            <button
              type="button"
              class="button"
              data-cy="move-cancel"
              [disabled]="busy()"
              (click)="close()"
            >
              {{ t().notes.editor.move.cancel }}
            </button>
            <button
              type="submit"
              class="button button--primary"
              data-cy="move-submit"
              [attr.aria-disabled]="dirty() || busy() || null"
              [attr.aria-busy]="busy() || null"
            >
              {{ busy() ? t().notes.editor.move.submitting : t().notes.editor.move.submit }}
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

    .note {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
})
export class MoveNoteSheetComponent {
  protected readonly t = inject(I18nService).t;

  readonly open = input.required<boolean>();
  readonly currentPath = input.required<string>();
  /** Há texto não salvo: renomear fica bloqueado até salvar. */
  readonly dirty = input(false);
  readonly busy = input(false);
  /** Falha da última tentativa (o backend recusou o caminho, por exemplo). */
  readonly problem = input<Problem | null>(null);

  readonly closed = output<void>();
  readonly submitted = output<string>();

  protected readonly form = new FormGroup({
    path: new FormControl('', { nonNullable: true, validators: [requiredTrimmed] }),
  });
  private readonly localProblem = signal(false);

  protected readonly banner = computed(() => {
    if (this.localProblem()) return this.t().notes.editor.move.pathInvalid;
    const problem = this.problem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const path = this.currentPath();
      untracked(() => {
        this.form.reset({ path });
        this.localProblem.set(false);
      });
    });
  }

  protected onSubmit(): void {
    this.localProblem.set(false);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.dirty() || this.busy()) return;
    const path = this.form.getRawValue().path.trim();
    if (pathProblem(path) !== null || !/\.md$/i.test(path)) {
      this.localProblem.set(true);
      return;
    }
    this.submitted.emit(path);
  }

  protected close(): void {
    if (!this.busy()) this.closed.emit();
  }
}
