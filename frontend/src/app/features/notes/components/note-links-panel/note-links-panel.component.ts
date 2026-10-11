import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { DisplayTextPipe } from '~/app/common/pipes/display-text.pipe';
import { routeOfLink } from '~/app/features/notes/services/link-routes';
import type { BacklinksState } from '~/modules/notes/core/facades/note-editor.facade';
import type { Note, NoteLink } from '~/modules/notes/core/types/note';

/** Texto de um alvo: o rótulo que o backend conhece, ou o tipo quando não há rótulo (alvo sem nome). */
function labelOf(link: NoteLink, fallback: string): string {
  return link.target?.label ?? link.text ?? fallback;
}

/**
 * Vínculos e backlinks da nota (T117): "Vinculada a" (vínculos explícitos, com o estado do alvo: estornada,
 * arquivada, cancelada, na lixeira, nunca some; pendente quando veio de uma importação e o alvo não existe),
 * "Links no texto" (os `[[wikilinks]]`, com "Criar nota" nos pendentes) e "Quem aponta para esta nota" (os
 * backlinks, com o trecho em texto puro). Quem decide as gravações é a página: este componente só emite. Os
 * vínculos nunca alteram valores. Presentational.
 */
@Component({
  selector: 'app-note-links-panel',
  imports: [RouterLink, DisplayTextPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel surface" data-cy="note-links" [attr.aria-label]="t().notes.links.title">
      <h2 class="panel__title">{{ t().notes.links.title }}</h2>

      <div class="block" data-cy="links-explicit">
        <h3 class="block__title">{{ t().notes.links.linkedTo }}</h3>
        @if (explicit().length === 0) {
          <p class="hint" data-cy="links-none">{{ t().notes.links.none }}</p>
        } @else {
          <ul class="list">
            @for (link of explicit(); track $index) {
              <li class="item" [attr.data-cy]="'link-' + $index">
                <span class="tag">{{ t().notes.links.types[link.type] }}</span>
                @let route = routeOf(link);
                @if (route) {
                  <a
                    class="item__label"
                    [routerLink]="route"
                    [attr.data-cy]="'link-open-' + $index"
                  >
                    {{ label(link) | displayText }}
                  </a>
                } @else {
                  <span class="item__label">{{ label(link) | displayText }}</span>
                }
                @if (link.state === 'PENDING') {
                  <span class="tag tag--pending" data-cy="link-pending">{{
                    t().notes.links.pending
                  }}</span>
                } @else if (statusText(link); as status) {
                  <span class="tag tag--status" [attr.data-cy]="'link-status-' + $index">{{
                    status
                  }}</span>
                }
                @if (!readonly()) {
                  <button
                    type="button"
                    class="button item__remove"
                    [disabled]="busy()"
                    [attr.aria-label]="removeLabel(link)"
                    [attr.data-cy]="'link-remove-' + $index"
                    (click)="removeLink.emit(link)"
                  >
                    {{ t().notes.links.remove }}
                  </button>
                }
              </li>
            }
          </ul>
          @if (hasPendingExplicit()) {
            <p class="hint" data-cy="links-pending-hint">{{ t().notes.links.pendingDropHint }}</p>
          }
        }
        @if (!readonly()) {
          <button
            type="button"
            class="button"
            data-cy="link-add"
            [disabled]="busy()"
            (click)="addLink.emit()"
          >
            {{ t().notes.links.add }}
          </button>
        }
      </div>

      <div class="block" data-cy="links-text">
        <h3 class="block__title">{{ t().notes.links.inText }}</h3>
        @if (wikilinks().length === 0) {
          <p class="hint" data-cy="links-text-none">{{ t().notes.links.inTextNone }}</p>
        } @else {
          <ul class="list">
            @for (link of wikilinks(); track $index) {
              <li class="item" [attr.data-cy]="'wikilink-' + $index">
                @if (link.state === 'RESOLVED' && link.target?.id) {
                  <a
                    class="item__label"
                    [routerLink]="['/notes', link.target.id]"
                    [attr.data-cy]="'wikilink-open-' + $index"
                  >
                    {{ link.text }}
                  </a>
                  @if (link.target.status === 'TRASHED') {
                    <span class="tag tag--status">{{ t().notes.links.status.TRASHED }}</span>
                  }
                } @else {
                  <span class="item__label">{{ link.text }}</span>
                  <span class="tag tag--pending" [attr.data-cy]="'wikilink-pending-' + $index">
                    {{ t().notes.links.pending }}
                  </span>
                  @if (!readonly() && link.text) {
                    <button
                      type="button"
                      class="button item__remove"
                      [attr.data-cy]="'wikilink-create-' + $index"
                      (click)="createNote.emit(link.text)"
                    >
                      {{ t().notes.links.createNote }}
                    </button>
                  }
                }
              </li>
            }
          </ul>
        }
      </div>

      <div class="block" data-cy="backlinks">
        <h3 class="block__title">{{ t().notes.links.backlinks }}</h3>
        @switch (backlinks().status) {
          @case ('loading') {
            <div class="list-skeleton" aria-hidden="true" data-cy="backlinks-loading">
              <div class="list-skeleton__row"></div>
            </div>
          }
          @case ('error') {
            <p class="banner" role="alert" data-cy="backlinks-error">
              {{ t().notes.links.backlinksError }}
              <button
                type="button"
                class="button"
                data-cy="backlinks-retry"
                (click)="retryBacklinks.emit()"
              >
                {{ t().notes.links.backlinksRetry }}
              </button>
            </p>
          }
          @case ('ready') {
            @if (backlinkItems().length === 0) {
              <p class="hint" data-cy="backlinks-none">{{ t().notes.links.backlinksNone }}</p>
            } @else {
              <ul class="list">
                @for (item of backlinkItems(); track item.noteId) {
                  <li class="item item--stack" [attr.data-cy]="'backlink-' + item.noteId">
                    <a class="item__label" [routerLink]="['/notes', item.noteId]"
                      ><bdi>{{ item.title | displayText }}</bdi></a
                    >
                    <span class="item__path"
                      ><bdi>{{ item.path | displayText }}</bdi></span
                    >
                    @if (item.context) {
                      <span
                        class="item__context"
                        [attr.data-cy]="'backlink-context-' + item.noteId"
                      >
                        <bdi>{{ item.context | displayText }}</bdi>
                      </span>
                    }
                  </li>
                }
              </ul>
            }
          }
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .panel {
      display: grid;
      gap: var(--space-4);
      padding: var(--space-4);
    }

    .panel__title,
    .block__title {
      margin: 0;
    }

    .panel__title {
      font-size: var(--text-lg);
    }

    .block {
      display: grid;
      gap: var(--space-2);
      justify-items: start;
    }

    .block__title {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
    }

    .hint {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .list {
      display: grid;
      gap: var(--space-2);
      width: 100%;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }

    .item--stack {
      display: grid;
      gap: 2px;
    }

    .item__label {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .item__remove {
      min-height: var(--touch-min);
      margin-left: auto;
    }

    .item__path,
    .item__context {
      overflow-wrap: anywhere;
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .tag {
      padding: 0 var(--space-2);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-pill);
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .tag--status,
    .tag--pending {
      color: var(--color-warning);
      border-color: var(--color-warning);
    }

    a:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }
  `,
})
export class NoteLinksPanelComponent {
  protected readonly t = inject(I18nService).t;

  readonly note = input.required<Note>();
  readonly backlinks = input.required<BacklinksState>();
  /** Nota na lixeira: nada se altera. */
  readonly readonly = input(false);
  readonly busy = input(false);

  readonly addLink = output<void>();
  readonly removeLink = output<NoteLink>();
  /** O texto de um `[[link]]` pendente, para criar a nota. */
  readonly createNote = output<string>();
  readonly retryBacklinks = output<void>();

  protected readonly explicit = computed(() =>
    this.note().links.filter((link) => link.origin === 'EXPLICIT'),
  );
  protected readonly hasPendingExplicit = computed(() =>
    this.explicit().some((link) => link.state === 'PENDING'),
  );
  /** Um item por alvo escrito no texto (o mesmo `[[nome]]` repetido aparece uma vez). */
  protected readonly wikilinks = computed(() => {
    const seen = new Set<string>();
    return this.note().links.filter((link) => {
      if (link.origin !== 'WIKILINK') return false;
      const key = `${link.text ?? ''}|${link.state}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  protected readonly backlinkItems = computed(() => {
    const state = this.backlinks();
    return state.status === 'ready' ? state.items : [];
  });

  protected routeOf = routeOfLink;

  protected label(link: NoteLink): string {
    return labelOf(link, this.t().notes.links.types[link.type]);
  }

  protected removeLabel(link: NoteLink): string {
    return interpolate(this.t().notes.links.removeNamed, { name: this.label(link) });
  }

  /** Estado do alvo (estornada, arquivada, cancelada, na lixeira): o vínculo continua e o diz. */
  protected statusText(link: NoteLink): string | null {
    const status = link.target?.status;
    if (!status || status === 'ACTIVE') return null;
    return this.t().notes.links.status[status];
  }
}
