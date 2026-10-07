import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { DisplayTextPipe } from '~/app/common/pipes/display-text.pipe';
import type { ImportReport, ImportWarning } from '~/modules/notes/core/types/note';

/** Quantos itens de cada lista aparecem (um zip pode ter até 2.000 arquivos). */
const LIST_LIMIT = 20;

/**
 * Relatório da importação (T119 CA2): criadas, puladas, links pendentes e o que ficou de fora (arquivos
 * ignorados, notas renomeadas, avisos), com a linguagem calma do DS ("Revise antes de seguir"). Tudo é **texto**:
 * nomes de arquivo e avisos vêm do zip do usuário e nunca viram marcação. As listas mostram os primeiros itens e
 * dizem quantos faltam. Presentational.
 */
@Component({
  selector: 'app-import-report',
  imports: [RouterLink, DisplayTextPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="report" aria-labelledby="import-report-title" data-cy="import-report">
      <h3 class="report__title" id="import-report-title">{{ t().notes.vault.report.title }}</h3>
      <p class="report__review" data-cy="import-report-review">
        {{ t().notes.vault.report.review }}
      </p>

      <dl class="report__counts" data-cy="import-report-counts">
        <div class="report__count">
          <dt>{{ t().notes.vault.report.created }}</dt>
          <dd class="num" data-cy="import-created">{{ report().created }}</dd>
        </div>
        <div class="report__count">
          <dt>{{ t().notes.vault.report.skipped }}</dt>
          <dd class="num" data-cy="import-skipped">{{ report().skipped }}</dd>
        </div>
        <div class="report__count">
          <dt>{{ t().notes.vault.report.pending }}</dt>
          <dd class="num" data-cy="import-pending">{{ report().pendingLinks }}</dd>
        </div>
        <div class="report__count">
          <dt>{{ t().notes.vault.report.ignored }}</dt>
          <dd class="num" data-cy="import-ignored">{{ report().ignoredFiles.length }}</dd>
        </div>
        <div class="report__count">
          <dt>{{ t().notes.vault.report.renamed }}</dt>
          <dd class="num" data-cy="import-renamed">{{ report().renamedFiles.length }}</dd>
        </div>
        <div class="report__count">
          <dt>{{ t().notes.vault.report.warnings }}</dt>
          <dd class="num" data-cy="import-warnings">{{ report().warnings.length }}</dd>
        </div>
      </dl>

      @if (report().renamedFiles.length > 0) {
        <div class="report__list" data-cy="import-renamed-list">
          <h4>{{ t().notes.vault.report.renamedFiles }}</h4>
          <ul>
            @for (item of renamed(); track $index) {
              <li>
                <bdi>{{ item | displayText }}</bdi>
              </li>
            }
          </ul>
          @if (more(report().renamedFiles.length); as text) {
            <p class="report__more">{{ text }}</p>
          }
        </div>
      }
      @if (report().skippedFiles.length > 0) {
        <div class="report__list" data-cy="import-skipped-list">
          <h4>{{ t().notes.vault.report.skippedFiles }}</h4>
          <ul>
            @for (item of skippedFiles(); track $index) {
              <li>
                <bdi>{{ item | displayText }}</bdi>
              </li>
            }
          </ul>
          @if (more(report().skippedFiles.length); as text) {
            <p class="report__more">{{ text }}</p>
          }
        </div>
      }
      @if (report().ignoredFiles.length > 0) {
        <div class="report__list" data-cy="import-ignored-list">
          <h4>{{ t().notes.vault.report.ignoredFiles }}</h4>
          <ul>
            @for (item of ignoredFiles(); track $index) {
              <li>
                <bdi>{{ item | displayText }}</bdi>
              </li>
            }
          </ul>
          @if (more(report().ignoredFiles.length); as text) {
            <p class="report__more">{{ text }}</p>
          }
        </div>
      }
      @if (report().warnings.length > 0) {
        <div class="report__list" data-cy="import-warnings-list">
          <h4>{{ t().notes.vault.report.warnings }}</h4>
          <ul>
            @for (item of warnings(); track $index) {
              <li>
                <span class="report__path"
                  ><bdi>{{ item.path | displayText }}</bdi></span
                >
                <span>: {{ warningText(item) }}</span>
              </li>
            }
          </ul>
          @if (more(report().warnings.length); as text) {
            <p class="report__more">{{ text }}</p>
          }
        </div>
      }

      <div class="report__actions">
        <a class="button button--primary" routerLink="/notes" data-cy="import-open-notes">
          {{ t().notes.vault.report.openNotes }}
        </a>
        <button type="button" class="button" data-cy="import-done" (click)="done.emit()">
          {{ t().notes.vault.report.done }}
        </button>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .report {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-card);
      background-color: var(--color-surface-muted);
    }

    .report__title,
    .report__list h4 {
      margin: 0;
    }

    .report__title {
      font-size: var(--text-md);
    }

    .report__review,
    .report__more {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .report__counts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: var(--space-2);
      margin: 0;
    }

    .report__count {
      display: grid;
      gap: 2px;
      padding: var(--space-2) var(--space-3);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-control);
      background-color: var(--color-surface);
    }

    .report__count dt {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .report__count dd {
      margin: 0;
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
    }

    .report__list {
      display: grid;
      gap: var(--space-1);
    }

    .report__list h4 {
      font-size: var(--text-sm);
    }

    .report__list ul {
      margin: 0;
      padding-left: var(--space-4);
      font-size: var(--text-sm);
      overflow-wrap: anywhere;
    }

    .report__path {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
    }

    .report__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class ImportReportComponent {
  protected readonly t = inject(I18nService).t;

  readonly report = input.required<ImportReport>();

  readonly done = output<void>();

  protected readonly renamed = computed(() =>
    this.report()
      .renamedFiles.slice(0, LIST_LIMIT)
      .map((file) =>
        interpolate(this.t().notes.vault.report.renamedItem, { from: file.from, to: file.to }),
      ),
  );
  protected readonly skippedFiles = computed(() => this.report().skippedFiles.slice(0, LIST_LIMIT));
  protected readonly ignoredFiles = computed(() => this.report().ignoredFiles.slice(0, LIST_LIMIT));
  protected readonly warnings = computed(() => this.report().warnings.slice(0, LIST_LIMIT));

  protected more(total: number): string | null {
    return total > LIST_LIMIT
      ? interpolate(this.t().notes.vault.report.more, { count: String(total - LIST_LIMIT) })
      : null;
  }

  /** O aviso traduzido pelo `code`; código novo mostra o texto genérico (a mensagem do backend não é a tela). */
  protected warningText(warning: ImportWarning): string {
    const copy = this.t().notes.vault.report;
    return copy.warningCodes[warning.code] ?? copy.warningOther;
  }
}
