import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ChipComponent } from '~/app/common/components/chip/chip.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { DisplayTextPipe } from '~/app/common/pipes/display-text.pipe';
import type { NoteSummary } from '~/modules/notes/core/types/note';
import { formatInstant } from '~/util/date';
import { highlightSegments } from '~/util/highlight';

/**
 * Uma nota na lista: título (link para o editor), caminho, trecho com o termo destacado (texto puro do
 * backend, marcado com `<mark>`: nunca HTML), tags e a data. `li[app-note-row]`. Presentational.
 */
@Component({
  selector: 'li[app-note-row]',
  imports: [RouterLink, ChipComponent, DisplayTextPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'note-row', '[attr.data-cy]': "'note-row-' + note().id" },
  template: `
    <a
      class="note-row__link"
      [routerLink]="['/notes', note().id]"
      [attr.data-cy]="'note-link-' + note().id"
    >
      <span class="note-row__title">
        <bdi>
          @for (part of titleParts(); track $index) {
            @if (part.match) {
              <mark>{{ part.text | displayText }}</mark>
            } @else {
              {{ part.text | displayText }}
            }
          }
        </bdi>
      </span>
      <span class="note-row__path"
        ><bdi>{{ note().path | displayText }}</bdi></span
      >
      @if (snippetParts().length > 0) {
        <span class="note-row__snippet" [attr.data-cy]="'note-snippet-' + note().id">
          @for (part of snippetParts(); track $index) {
            @if (part.match) {
              <mark>{{ part.text | displayText }}</mark>
            } @else {
              {{ part.text | displayText }}
            }
          }
        </span>
      }
      <span class="note-row__meta">
        @for (tag of note().tags; track tag) {
          <app-chip [label]="'#' + tag" [cy]="'note-tag-' + note().id + '-' + tag" />
        }
        <span class="note-row__date">{{ updated() }}</span>
      </span>
    </a>
  `,
  styles: `
    :host {
      display: block;
      border-bottom: var(--border-width) solid var(--color-border);
    }

    :host(:last-child) {
      border-bottom: 0;
    }

    .note-row__link {
      display: grid;
      gap: var(--space-1);
      padding: var(--space-3) var(--space-2);
      border-radius: var(--radius-control);
      color: inherit;
      text-decoration: none;
      transition: background-color var(--duration-fast) var(--ease-standard);
    }

    .note-row__link:hover {
      background-color: var(--color-hover-soft);
    }

    .note-row__link:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }

    .note-row__title {
      overflow-wrap: anywhere;
      font-weight: var(--weight-medium);
    }

    .note-row__path,
    .note-row__date {
      overflow-wrap: anywhere;
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .note-row__snippet {
      overflow-wrap: anywhere;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .note-row__meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }

    mark {
      padding: 0 2px;
      border-radius: 4px;
      background-color: var(--color-surface-muted);
      color: var(--color-text);
      box-shadow: inset 0 -2px 0 var(--color-accent);
    }
  `,
})
export class NoteRowComponent {
  private readonly i18n = inject(I18nService);

  readonly note = input.required<NoteSummary>();
  /** O termo buscado, para destacar no título e no trecho. */
  readonly term = input('');

  protected readonly titleParts = computed(() => highlightSegments(this.note().title, this.term()));
  protected readonly snippetParts = computed(() => {
    const snippet = this.note().snippet;
    return snippet ? highlightSegments(snippet, this.term()) : [];
  });
  protected readonly updated = computed(() =>
    interpolate(this.i18n.t().notes.list.updated, {
      date: formatInstant(this.note().updatedAt, HTML_LANG[this.i18n.language()]),
    }),
  );
}
