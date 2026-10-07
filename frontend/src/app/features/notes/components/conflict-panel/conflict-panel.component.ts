import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { NoteConflict } from '~/modules/notes/core/facades/note-editor.facade';
import { lineDiff } from '~/util/line-diff';

/** Linhas da diferença desenhadas por vez ("ver mais" mostra o próximo bloco). */
export const DIFF_PAGE = 300;

/**
 * "Esta nota mudou em outro lugar" (`VERSION_CONFLICT`): **nada é sobrescrito sozinho**. O texto digitado
 * continua no editor; aqui o usuário vê a diferença linha a linha (texto puro, nenhuma linha vira marcação) e
 * escolhe: salvar o texto dele por cima (reenvia com a versão atual do servidor) ou usar a versão do servidor
 * (troca o texto do editor, por escolha explícita). Presentational.
 */
@Component({
  selector: 'app-conflict-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="conflict"
      role="alert"
      aria-labelledby="conflict-title"
      data-cy="conflict-panel"
    >
      <h2 class="conflict__title" id="conflict-title">{{ t().notes.editor.conflict.title }}</h2>
      <p data-cy="conflict-description">{{ description() }}</p>
      <div class="conflict__actions">
        <button
          type="button"
          class="button"
          data-cy="conflict-toggle-diff"
          [attr.aria-expanded]="showDiff()"
          (click)="showDiff.set(!showDiff())"
        >
          {{ showDiff() ? t().notes.editor.conflict.hideDiff : t().notes.editor.conflict.viewDiff }}
        </button>
        @if (canKeepMine()) {
          <button
            type="button"
            class="button button--primary"
            data-cy="conflict-keep-mine"
            [disabled]="busy()"
            (click)="keepMine.emit()"
          >
            {{ t().notes.editor.conflict.keepMine }}
          </button>
        }
        <button
          type="button"
          [class]="canKeepMine() ? 'button' : 'button button--primary'"
          data-cy="conflict-use-remote"
          [disabled]="busy()"
          (click)="useRemote.emit()"
        >
          {{ t().notes.editor.conflict.useRemote }}
        </button>
      </div>
      @if (showDiff()) {
        @if (diff(); as lines) {
          <div
            class="conflict__diff"
            role="group"
            tabindex="0"
            [attr.aria-label]="t().notes.editor.conflict.diffLabel"
            data-cy="conflict-diff"
          >
            @for (line of shown(); track $index) {
              <div class="diff__line" [class]="'diff__line diff__line--' + line.kind">
                <span class="diff__mark" aria-hidden="true">{{ marks[line.kind] }}</span>
                <span class="visually-hidden">{{ labels()[line.kind] }}:</span>
                <span class="diff__text">{{ line.text }}</span>
              </div>
            }
          </div>
          @if (lines.length > shown().length) {
            <div class="conflict__more">
              <p class="conflict__note" role="status" data-cy="conflict-diff-count">
                {{ countText(shown().length, lines.length) }}
              </p>
              <button
                type="button"
                class="button"
                data-cy="conflict-diff-more"
                (click)="visible.set(visible() + DIFF_PAGE)"
              >
                {{ t().notes.editor.conflict.diffShowMore }}
              </button>
            </div>
          }
        } @else {
          <p class="conflict__note" data-cy="conflict-diff-too-big">
            {{ t().notes.editor.conflict.diffTooBig }}
          </p>
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .conflict {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
      border: var(--border-width) solid var(--color-warning);
      border-radius: var(--radius-card);
      background-color: var(--color-surface);
    }

    .conflict p,
    .conflict__title {
      margin: 0;
    }

    .conflict__title {
      font-size: var(--text-md);
    }

    .conflict__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .conflict__diff {
      max-height: 16rem;
      overflow: auto;
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-control);
      font-family: var(--font-mono);
      font-size: var(--text-sm);
    }

    .conflict__diff:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }

    .diff__line {
      display: flex;
      gap: var(--space-2);
      padding: 0 var(--space-2);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .diff__line--added {
      background-color: var(--color-surface-muted);
      box-shadow: inset 3px 0 0 var(--color-positive);
    }

    .diff__line--removed {
      background-color: var(--color-surface-muted);
      box-shadow: inset 3px 0 0 var(--color-risk);
    }

    .diff__mark {
      flex: none;
      width: 1ch;
      color: var(--color-text-muted);
    }

    .conflict__more {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }

    .conflict__note {
      color: var(--color-text-muted);
    }
  `,
})
export class ConflictPanelComponent {
  protected readonly t = inject(I18nService).t;

  /** O texto da versão do servidor. */
  readonly remote = input.required<string>();
  /** O texto digitado pelo usuário (continua no editor). */
  readonly mine = input.required<string>();
  /** Qual ação deu o conflito: muda o texto do painel (renomear e vincular não são "salvar o texto"). */
  readonly during = input<NoteConflict['during']>('save');
  /** `false` quando o usuário não digitou nada: então "salvar o meu texto por cima" não é oferecido. */
  readonly canKeepMine = input(true);
  /** Uma escrita em andamento: bloqueia as duas escolhas. */
  readonly busy = input(false);

  readonly keepMine = output<void>();
  readonly useRemote = output<void>();

  protected readonly description = computed(() => {
    const copy = this.t().notes.editor.conflict;
    if (this.during() === 'move') return copy.descriptionMove;
    if (this.during() === 'links') return copy.descriptionLinks;
    return copy.description;
  });
  protected readonly showDiff = signal(false);
  /** Quantas linhas da diferença estão desenhadas (o resto vem sob demanda: o DOM não cresce com a nota). */
  protected readonly visible = signal(DIFF_PAGE);
  protected readonly DIFF_PAGE = DIFF_PAGE;
  protected readonly marks = { same: ' ', added: '+', removed: '-' } as const;
  protected readonly labels = computed(() => {
    const copy = this.t().notes.editor.conflict;
    return { same: copy.diffSame, added: copy.diffAdded, removed: copy.diffRemoved };
  });
  /** Só calcula quando o usuário abre a diferença. */
  protected readonly diff = computed(() =>
    this.showDiff() ? lineDiff(this.remote(), this.mine()) : null,
  );
  protected readonly shown = computed(() => this.diff()?.slice(0, this.visible()) ?? []);

  protected countText(shown: number, total: number): string {
    return interpolate(this.t().notes.editor.conflict.diffCount, {
      shown: String(shown),
      total: String(total),
    });
  }
}
