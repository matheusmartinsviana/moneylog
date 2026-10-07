import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { DisplayTextPipe } from '~/app/common/pipes/display-text.pipe';
import type { NoteSummary } from '~/modules/notes/core/types/note';
import { formatInstant } from '~/util/date';

/** Notas na lixeira, cada uma com "Restaurar". Nada some em silêncio (S-161). Presentational. */
@Component({
  selector: 'app-trash-list',
  imports: [DisplayTextPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="trash" data-cy="trash-list">
      @for (note of notes(); track note.id) {
        <li class="trash__row" [attr.data-cy]="'trash-row-' + note.id">
          <div class="trash__text">
            <span class="trash__title"
              ><bdi>{{ note.title | displayText }}</bdi></span
            >
            <span class="trash__path"
              ><bdi>{{ note.path | displayText }}</bdi></span
            >
            @if (note.trashedAt) {
              <span class="trash__date">{{ trashedAt(note.trashedAt) }}</span>
            }
          </div>
          <button
            type="button"
            class="button"
            [disabled]="busy()"
            [attr.aria-label]="restoreLabel(note.title)"
            [attr.data-cy]="'trash-restore-' + note.id"
            (click)="restore.emit(note.id)"
          >
            {{ t().notes.trash.restore }}
          </button>
        </li>
      }
    </ul>
  `,
  styles: `
    .trash {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .trash__row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-2);
      border-bottom: var(--border-width) solid var(--color-border);
    }

    .trash__row:last-child {
      border-bottom: 0;
    }

    .trash__text {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
    }

    .trash__title {
      overflow-wrap: anywhere;
      font-weight: var(--weight-medium);
    }

    .trash__path,
    .trash__date {
      overflow-wrap: anywhere;
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }
  `,
})
export class TrashListComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly notes = input.required<readonly NoteSummary[]>();
  /** Uma restauração em andamento: bloqueia os botões. */
  readonly busy = input(false);

  readonly restore = output<string>();

  protected restoreLabel(title: string): string {
    return interpolate(this.t().notes.trash.restoreNamed, { title });
  }

  protected trashedAt(value: string): string {
    return interpolate(this.t().notes.trash.trashedAt, {
      date: formatInstant(value, HTML_LANG[this.i18n.language()]),
    });
  }
}
