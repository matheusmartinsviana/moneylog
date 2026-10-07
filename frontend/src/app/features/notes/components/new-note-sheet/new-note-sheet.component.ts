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

import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { applyProblemToForm } from '~/app/common/forms/problem-form';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { ToastService } from '~/app/common/services/toast.service';
import { requiredTrimmed } from '~/app/features/quick-add/components/requirements';
import { NoteCreateFacade } from '~/modules/notes/core/facades/note-create.facade';
import type { Note, NoteLinkRef } from '~/modules/notes/core/types/note';
import { buildNotePath, type PathProblem, pathProblem } from '~/modules/notes/core/types/note-path';

/** Códigos de regra que o backend atribui ao campo do nome. */
const CODE_TO_FIELD: Readonly<Record<string, string>> = {
  NOTE_PATH_TAKEN: 'name',
  NOTE_PATH_INVALID: 'name',
};

/**
 * "Nova nota" (folha): nome e pasta opcional viram o caminho `.md`. Serve a lista de notas e o bloco "Notas
 * vinculadas" das telas financeiras (`links`: a nota nasce já ligada ao registro, sem o front tocar em valor
 * algum). A criação leva `Idempotency-Key` por tentativa, reutilizada no "tentar de novo" depois de falha
 * ambígua. O caminho é conferido aqui só para avisar cedo; o backend é a verdade (`NOTE_PATH_INVALID`,
 * `NOTE_PATH_TAKEN`, `NOTE_LIMIT_REACHED`). Escopo de componente: `NoteCreateFacade`.
 */
@Component({
  selector: 'app-new-note-sheet',
  imports: [ReactiveFormsModule, SheetComponent, TextFieldComponent],
  providers: [NoteCreateFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet
      cy="new-note-sheet"
      [open]="open()"
      [heading]="heading() ?? t().notes.create.title"
      [description]="description() ?? t().notes.create.description"
      [dismissable]="!facade.saving()"
      (closed)="close()"
    >
      @if (open()) {
        <form
          class="form"
          [formGroup]="form"
          (ngSubmit)="onSubmit()"
          novalidate
          data-cy="new-note-form"
        >
          <app-text-field
            formControlName="name"
            fieldId="new-note-name"
            [label]="t().notes.create.nameLabel"
            [hint]="t().notes.create.nameHint"
            [maxlength]="200"
            data-autofocus
          />
          <app-text-field
            formControlName="folder"
            fieldId="new-note-folder"
            [label]="t().notes.create.folderLabel"
            [hint]="t().notes.create.folderHint"
            [mandatory]="false"
            [maxlength]="200"
          />
          @if (banner(); as message) {
            <p class="banner" role="alert" data-cy="new-note-error">{{ message }}</p>
          }
          <div class="actions">
            <button
              type="button"
              class="button"
              data-cy="new-note-cancel"
              [disabled]="facade.saving()"
              (click)="close()"
            >
              {{ t().notes.create.cancel }}
            </button>
            <button
              type="submit"
              class="button button--primary"
              data-cy="new-note-submit"
              [disabled]="facade.saving()"
              [attr.aria-busy]="facade.saving() || null"
            >
              {{ facade.saving() ? t().notes.create.submitting : t().notes.create.submit }}
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
export class NewNoteSheetComponent {
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(NoteCreateFacade);

  readonly open = input.required<boolean>();
  /** Vínculos explícitos da nota nova (ex.: a movimentação aberta). */
  readonly links = input<readonly NoteLinkRef[]>([]);
  /** Nome sugerido ao abrir (o usuário pode trocar). */
  readonly suggestedName = input('');
  /** Pasta sugerida ao abrir (ex.: a de um `[[pasta/nome]]` pendente). */
  readonly suggestedFolder = input('');
  readonly heading = input<string>();
  readonly description = input<string>();

  readonly closed = output<void>();
  readonly created = output<Note>();

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [requiredTrimmed] }),
    folder: new FormControl('', { nonNullable: true }),
  });

  private readonly localProblem = signal<PathProblem | null>(null);
  private readonly fieldHandled = signal(false);
  protected readonly banner = computed(() => {
    const local = this.localProblem();
    if (local === 'TOO_LONG') return this.t().notes.create.pathTooLong;
    if (local === 'TOO_DEEP') return this.t().notes.create.pathTooDeep;
    if (local === 'INVALID' || local === 'EMPTY') return this.t().notes.create.pathInvalid;
    const problem = this.facade.problem();
    if (!problem || this.fieldHandled()) return null;
    return problemMessage(problem, this.t().errors);
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const name = this.suggestedName();
      const folder = this.suggestedFolder();
      untracked(() => {
        this.form.reset({ name, folder });
        this.localProblem.set(null);
        this.fieldHandled.set(false);
        this.facade.dismissProblem();
      });
    });
    effect(() => {
      const problem = this.facade.problem();
      untracked(() => {
        this.fieldHandled.set(
          problem !== null && applyProblemToForm(this.form, problem, CODE_TO_FIELD),
        );
      });
    });
    this.facade.created$.pipe(takeUntilDestroyed()).subscribe((note) => {
      this.toast.show(this.t().notes.create.created);
      this.created.emit(note);
    });
  }

  protected onSubmit(): void {
    this.localProblem.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, folder } = this.form.getRawValue();
    const path = buildNotePath(folder, name);
    const problem = pathProblem(path);
    if (problem !== null) {
      this.localProblem.set(problem);
      return;
    }
    const title = name.trim().replace(/\.md$/i, '').trim();
    this.facade.create({
      path,
      body: `# ${title}\n\n`,
      ...(this.links().length > 0 ? { links: this.links() } : {}),
    });
  }

  protected close(): void {
    if (!this.facade.saving()) this.closed.emit();
  }
}
