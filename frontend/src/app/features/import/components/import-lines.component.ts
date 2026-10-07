import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { ImportLine } from '~/modules/imports/core/types/import';
import { formatIsoDate } from '~/util/date';

/**
 * Linhas do extrato (presentational): tabela estilo planilha no desktop e lista de cartões no celular, com as
 * mesmas ações. Teclado: setas mudam de linha; `A` aceita, `R` rejeita e `C` edita a categoria **só quando a
 * própria linha está em foco** (digitar num campo ou usar um botão não dispara atalho). Estado e marcas
 * aparecem em texto, nunca só pela cor; categoria sugerida mostra "confiança alta/média".
 */
@Component({
  selector: 'app-import-lines',
  imports: [RouterLink, MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './import-lines.component.html',
  styleUrl: './import-lines.component.css',
})
export class ImportLinesComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly lines = input.required<readonly ImportLine[]>();
  /** Nomes das categorias por id (o backend manda só o id). */
  readonly categoryNames = input<Readonly<Record<string, string>>>({});
  /** Só um lote em revisão aceita decisões. */
  readonly editable = input(true);
  readonly busy = input(false);

  readonly accept = output<ImportLine>();
  readonly reject = output<ImportLine>();
  /** Desfaz a aceitação (`REOPEN`). */
  readonly reopen = output<ImportLine>();
  /** Abre a folha de edição/decisão (categoria, método, descrição, transferência, parcela, forçar). */
  readonly edit = output<ImportLine>();

  protected readonly active = signal(0);
  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);

  protected date(line: ImportLine): string {
    return formatIsoDate(line.date, this.locale());
  }

  protected rowLabel(line: ImportLine): string {
    return interpolate(this.t().imports.review.rowLabel, { position: String(line.position) });
  }

  protected categoryText(line: ImportLine): string | null {
    const id = line.categoryId ?? line.suggestion?.categoryId ?? null;
    if (id === null) return null;
    return Object.hasOwn(this.categoryNames(), id) ? (this.categoryNames()[id] ?? null) : null;
  }

  /** A categoria mostrada é só uma sugestão (a linha ainda não tem categoria própria). */
  protected isSuggestion(line: ImportLine): boolean {
    return line.categoryId === null && line.suggestion !== null;
  }

  protected confidence(line: ImportLine): string | null {
    if (!this.isSuggestion(line) || !line.suggestion) return null;
    const copy = this.t().imports.review;
    return line.suggestion.confidence === 'HIGH' ? copy.confidenceHigh : copy.confidenceMedium;
  }

  protected methodText(line: ImportLine): string {
    const method = line.method ?? line.suggestion?.method ?? null;
    if (method === null) return '';
    const labels = this.t().transactions.methods;
    return Object.hasOwn(labels, method) ? labels[method as keyof typeof labels] : method;
  }

  protected canQuickAccept(line: ImportLine): boolean {
    return (
      this.editable() &&
      (line.status === 'PENDING' || line.status === 'REJECTED') &&
      !line.requiresDecision
    );
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const row = event.currentTarget as HTMLElement;
    // Atalhos só com a própria linha em foco (não dentro de botões, links ou campos).
    if (event.target !== row || event.ctrlKey || event.metaKey || event.altKey) return;
    const line = this.lines()[index];
    if (!line) return;
    const key = event.key.toLowerCase();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.focusRow(index + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (this.editable() && !this.busy()) {
      if (key === 'a' && this.canQuickAccept(line)) {
        event.preventDefault();
        this.accept.emit(line);
      } else if (key === 'r' && line.status !== 'REJECTED' && line.status !== 'DUPLICATE') {
        event.preventDefault();
        this.reject.emit(line);
      } else if (key === 'c') {
        event.preventDefault();
        this.edit.emit(line);
      }
    }
  }

  private focusRow(index: number): void {
    const rows = this.host.nativeElement.querySelectorAll<HTMLElement>('[data-line-row]');
    const target = rows[Math.min(Math.max(index, 0), rows.length - 1)];
    if (!target) return;
    this.active.set(Number(target.dataset['index']));
    target.focus();
  }
}
