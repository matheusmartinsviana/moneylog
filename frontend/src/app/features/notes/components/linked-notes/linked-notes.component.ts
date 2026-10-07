import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';

import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { NewNoteSheetComponent } from '~/app/features/notes/components/new-note-sheet/new-note-sheet.component';
import { NoteRowComponent } from '~/app/features/notes/components/note-row/note-row.component';
import { LinkedNotesFacade } from '~/modules/notes/core/facades/linked-notes.facade';
import type {
  Note,
  NoteLinkRef,
  NoteLinkType,
  NoteTargetStatus,
} from '~/modules/notes/core/types/note';
import { safeFileName } from '~/modules/notes/core/types/note-path';

let nextId = 0;

/**
 * Bloco "Notas vinculadas" das telas financeiras (T118): as notas ativas ligadas ao registro (`GET /v1/links`),
 * com "Nova nota vinculada" (a nota nasce já ligada e abre no editor) e os estados vazio, carregando e erro (com
 * "tentar de novo"). Fica em `features/notes` e é **usado pelas páginas** das outras telas: nenhum módulo importa
 * `notes`. O registro continua sendo o dono do valor: uma nota nunca o altera. Se o registro está estornado,
 * arquivado ou cancelado, o bloco continua e mostra o estado (`status`). Escopo de componente.
 */
@Component({
  selector: 'app-linked-notes',
  imports: [ErrorStateComponent, NoteRowComponent, NewNoteSheetComponent],
  providers: [LinkedNotesFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="linked surface"
      [attr.aria-labelledby]="headingId"
      [attr.data-cy]="cy() + '-block'"
    >
      <div class="linked__head">
        <h2 class="linked__title" [id]="headingId">{{ title() }}</h2>
        @if (statusText(); as text) {
          <span class="tag" [attr.data-cy]="cy() + '-status'">{{ text }}</span>
        }
      </div>

      @switch (facade.state().status) {
        @case ('loading') {
          <div [attr.data-cy]="cy() + '-loading'">
            <p class="visually-hidden" role="status">{{ t().notes.linked.loading }}</p>
            <div class="list-skeleton" aria-hidden="true">
              <div class="list-skeleton__row"></div>
            </div>
          </div>
        }
        @case ('error') {
          @if (problem(); as p) {
            <app-error-state [problem]="p" (retry)="facade.retry()" />
          }
        }
        @case ('ready') {
          @if (facade.items().length === 0) {
            <p class="linked__empty" [attr.data-cy]="cy() + '-empty'">
              {{ t().notes.linked.empty }}
            </p>
          } @else {
            <ul class="linked__list" [attr.data-cy]="cy() + '-list'">
              @for (note of facade.items(); track note.id) {
                <li app-note-row [note]="note"></li>
              }
            </ul>
            @if (hasNext()) {
              <button
                type="button"
                class="button"
                [attr.data-cy]="cy() + '-more'"
                [disabled]="facade.loadingMore()"
                (click)="facade.loadMore()"
              >
                {{ t().notes.linked.loadMore }}
              </button>
            }
          }
        }
      }

      <div class="linked__foot">
        <button
          type="button"
          class="button"
          [attr.data-cy]="cy() + '-new'"
          (click)="creating.set(true)"
        >
          {{ t().notes.linked.newNote }}
        </button>
        <p class="linked__note">{{ t().notes.linked.note }}</p>
      </div>

      <app-new-note-sheet
        [open]="creating()"
        [links]="links()"
        [suggestedName]="suggestedName()"
        [heading]="t().notes.linked.createTitle"
        [description]="t().notes.linked.createDescription"
        (closed)="creating.set(false)"
        (created)="created($event)"
      />
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .linked {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }

    .linked__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }

    .linked__title {
      margin: 0;
      font-size: var(--text-lg);
    }

    .linked__list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .linked__empty,
    .linked__note {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .linked__foot {
      display: grid;
      gap: var(--space-2);
      justify-items: start;
    }

    .tag {
      padding: 0 var(--space-2);
      border: var(--border-width) solid var(--color-warning);
      border-radius: var(--radius-pill);
      color: var(--color-warning);
      font-size: var(--text-xs);
    }
  `,
})
export class LinkedNotesComponent {
  private readonly router = inject(Router);
  protected readonly t = inject(I18nService).t;
  protected readonly facade = inject(LinkedNotesFacade);

  /** O que o registro é (`TRANSACTION`, `GOAL`, `PERSON`, `DEBT`, `CARD`, `INVOICE`, `MONTHLY_SUMMARY`). */
  readonly type = input.required<NoteLinkType>();
  /** `id` do registro (todos os tipos, menos o resumo mensal). */
  readonly entityId = input<string>();
  /** `AAAA-MM` do resumo mensal. */
  readonly entityKey = input<string>();
  /** Nome do registro, para sugerir o título da nota nova. */
  readonly label = input('');
  /** Estado do registro (estornada, arquivada, cancelada): o bloco continua e o mostra. */
  readonly status = input<NoteTargetStatus | null>(null);
  /** Resumo mensal: título "Vinculada à revisão mensal". */
  readonly monthly = input(false);
  /** Sufixo do `data-cy` do bloco (`linked-notes`). */
  readonly cy = input('linked-notes');

  protected readonly creating = signal(false);
  private readonly uid = ++nextId;
  protected readonly headingId = `linked-notes-title-${this.uid}`;

  protected readonly title = computed(() =>
    this.monthly() ? this.t().notes.linked.monthlyTitle : this.t().notes.linked.title,
  );
  protected readonly hasNext = computed(() => {
    const state = this.facade.state();
    return state.status === 'ready' && state.hasNext;
  });
  protected readonly problem = computed(() => {
    const state = this.facade.state();
    return state.status === 'error' ? state.problem : null;
  });
  protected readonly statusText = computed(() => {
    const status = this.status();
    if (!status || status === 'ACTIVE') return null;
    return this.t().notes.links.status[status as 'VOIDED' | 'ARCHIVED' | 'CANCELED' | 'TRASHED'];
  });
  protected readonly links = computed<readonly NoteLinkRef[]>(() => {
    const id = this.entityId();
    const key = this.entityKey();
    if (this.type() === 'MONTHLY_SUMMARY') return key ? [{ type: this.type(), key }] : [];
    return id ? [{ type: this.type(), id }] : [];
  });
  protected readonly suggestedName = computed(() => {
    const name = safeFileName(this.label());
    return name === '' ? '' : interpolate(this.t().notes.create.suggestion, { name });
  });

  constructor() {
    effect(() => {
      const type = this.type();
      const id = this.entityId();
      const key = this.entityKey();
      untracked(() => {
        if (type === 'MONTHLY_SUMMARY' ? key : id) {
          this.facade.load({ type, ...(id ? { id } : {}), ...(key ? { key } : {}) });
        }
      });
    });
  }

  protected created(note: Note): void {
    this.creating.set(false);
    void this.router.navigate(['/notes', note.id]);
  }
}
