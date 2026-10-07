import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import { FieldControl } from '~/app/common/components/forms/field-control';
import { FieldErrorComponent } from '~/app/common/components/forms/field-error/field-error.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { formatBytes } from '~/util/format-bytes';

export type FilePickerProblem = 'tooLarge' | 'wrongType' | 'empty';

/**
 * Seletor de arquivo próprio (ADR-007, FE-S-119): a **única** exceção nativa do projeto. O seletor de arquivos
 * é do sistema operacional e não existe como substituir; por isso o `<input type="file">` fica **escondido**
 * (`hidden`, fora da ordem de tabulação e da árvore de acessibilidade) dentro deste componente e é acionado
 * pelo clique do botão "Escolher arquivo" (um gesto do usuário, o que o iOS exige). A guarda de controles
 * nativos só aceita esse `input` neste arquivo (`scripts/check-native-controls.mjs`).
 *
 * Valor: `File | null` (CVA). Valida extensão (`accept`), tamanho (`maxBytes`) e arquivo vazio **antes** de
 * entregar: um arquivo recusado nunca vira valor, o motivo aparece como erro do campo (`role="alert"`, sem
 * `alert()`) e sai em `rejected`. Aceita arrastar e soltar (1 arquivo) e anuncia "arquivo recebido" para
 * leitor de tela. Mostra nome e tamanho e permite remover. Presentational.
 */
@Component({
  selector: 'app-file-picker',
  imports: [FieldErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FilePickerComponent), multi: true },
  ],
  template: `
    <div
      class="field picker"
      [class.picker--drag]="dragging()"
      (dragenter)="onDrag($event, true)"
      (dragover)="onDrag($event, true)"
      (dragleave)="onDrag($event, false)"
      (drop)="onDrop($event)"
    >
      <span class="field__label" [id]="labelId()">{{ label() }}</span>
      <input
        #native
        type="file"
        hidden
        tabindex="-1"
        aria-hidden="true"
        [attr.accept]="accept() ?? null"
        [attr.data-cy]="fieldId() + '-native'"
        (change)="onNative($event)"
      />
      @if (file(); as chosen) {
        <div class="picker__file" [attr.data-cy]="fieldId() + '-file'">
          <span class="picker__name" [attr.data-cy]="fieldId() + '-name'">{{ chosen.name }}</span>
          <span class="picker__size num" [attr.data-cy]="fieldId() + '-size'">{{
            sizeText()
          }}</span>
          <button
            type="button"
            class="button"
            [id]="buttonId()"
            [disabled]="disabled()"
            [attr.data-cy]="fieldId()"
            [attr.aria-describedby]="describedBy()"
            (click)="open()"
          >
            {{ t().form.filePicker.change }}
          </button>
          <button
            type="button"
            class="button"
            [disabled]="disabled()"
            [attr.data-cy]="fieldId() + '-remove'"
            (click)="clear()"
          >
            {{ t().form.filePicker.remove }}
          </button>
        </div>
      } @else {
        <div class="picker__empty">
          <button
            type="button"
            class="button"
            [id]="buttonId()"
            [disabled]="disabled()"
            [attr.data-cy]="fieldId()"
            [attr.aria-labelledby]="labelId() + ' ' + buttonId()"
            [attr.aria-describedby]="describedBy()"
            (click)="open()"
          >
            {{ t().form.filePicker.choose }}
          </button>
          <span class="picker__drop">{{ t().form.filePicker.dropHint }}</span>
        </div>
      }
      @if (hint(); as text) {
        <p class="field__hint" [id]="hintId()">{{ text }}</p>
      }
      @if (problem(); as text) {
        <p
          class="picker__error"
          role="alert"
          [id]="errorId()"
          [attr.data-cy]="fieldId() + '-error'"
        >
          {{ text }}
        </p>
      }
      <app-field-error [control]="control()" [errorId]="errorId()" />
      <p class="visually-hidden" role="status" [attr.data-cy]="fieldId() + '-announce'">
        {{ announcement() }}
      </p>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .picker {
      padding: var(--space-3);
      border: var(--border-width) dashed var(--color-control-border);
      border-radius: var(--radius-control);
    }

    .picker--drag {
      border-color: var(--color-accent);
      background-color: var(--color-surface-muted);
    }

    .picker__empty,
    .picker__file {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-3);
    }

    .picker__name {
      min-width: 0;
      overflow-wrap: anywhere;
      font-weight: var(--weight-medium);
    }

    .picker__size,
    .picker__drop {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .picker__error {
      color: var(--color-risk);
      font-size: var(--text-xs);
      line-height: var(--leading-normal);
    }

    .button:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }
  `,
})
export class FilePickerComponent extends FieldControl<File | null> {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  /** Extensões aceitas, no formato do atributo `accept` (`.zip`). */
  readonly accept = input<string>();
  /** Tamanho máximo em bytes; `undefined` = sem limite no front. */
  readonly maxBytes = input<number>();

  /** O arquivo escolhido foi recusado (tipo, tamanho ou vazio). */
  readonly rejected = output<FilePickerProblem>();

  private readonly native = viewChild.required<ElementRef<HTMLInputElement>>('native');
  protected readonly file = signal<File | null>(null);
  private readonly problemKey = signal<FilePickerProblem | null>(null);
  protected readonly dragging = signal(false);
  protected readonly announcement = signal('');

  protected readonly buttonId = computed(() => `${this.controlId()}-button`);
  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);
  protected readonly sizeText = computed(() => formatBytes(this.file()?.size ?? 0, this.locale()));
  protected readonly problem = computed(() => {
    const key = this.problemKey();
    if (key === null) return null;
    const copy = this.t().form.filePicker;
    if (key === 'empty') return copy.empty;
    if (key === 'tooLarge') {
      return interpolate(copy.tooLarge, { max: formatBytes(this.maxBytes() ?? 0, this.locale()) });
    }
    return interpolate(copy.wrongType, { types: this.accept() ?? '' });
  });

  protected override readonly describedBy = computed(() => {
    const ids = [
      this.hint() ? this.hintId() : null,
      this.problemKey() !== null || this.showError() ? this.errorId() : null,
    ];
    return ids.filter((id) => id !== null).join(' ') || null;
  });

  writeValue(value: File | null): void {
    this.file.set(value);
    this.problemKey.set(null);
  }

  /** Abre o seletor do sistema. Só chamar de dentro de um clique (gesto do usuário). */
  open(): void {
    if (!this.disabled()) this.native().nativeElement.click();
  }

  clear(): void {
    this.native().nativeElement.value = '';
    this.take(null);
    this.onTouched();
  }

  protected onNative(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = input.files?.item(0) ?? null;
    // Permite escolher o mesmo arquivo de novo depois de remover.
    input.value = '';
    if (chosen) this.take(chosen);
    this.onTouched();
  }

  protected onDrag(event: DragEvent, over: boolean): void {
    if (this.disabled()) return;
    event.preventDefault();
    this.dragging.set(over);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.disabled()) return;
    const dropped = event.dataTransfer?.files?.item(0) ?? null;
    if (dropped) this.take(dropped);
    this.onTouched();
  }

  /** Valida e entrega: arquivo recusado nunca vira valor. */
  private take(chosen: File | null): void {
    if (chosen === null) {
      this.problemKey.set(null);
      this.file.set(null);
      this.announcement.set('');
      this.onChange(null);
      return;
    }
    const problem = this.check(chosen);
    if (problem !== null) {
      this.problemKey.set(problem);
      this.file.set(null);
      this.announcement.set('');
      this.onChange(null);
      this.rejected.emit(problem);
      return;
    }
    this.problemKey.set(null);
    this.file.set(chosen);
    this.announcement.set(interpolate(this.t().form.filePicker.received, { name: chosen.name }));
    this.onChange(chosen);
  }

  private check(chosen: File): FilePickerProblem | null {
    const accept = this.accept();
    if (accept) {
      const allowed = accept
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.startsWith('.'));
      if (allowed.length > 0 && !allowed.some((ext) => chosen.name.toLowerCase().endsWith(ext))) {
        return 'wrongType';
      }
    }
    if (chosen.size === 0) return 'empty';
    const max = this.maxBytes();
    if (max !== undefined && chosen.size > max) return 'tooLarge';
    return null;
  }
}
