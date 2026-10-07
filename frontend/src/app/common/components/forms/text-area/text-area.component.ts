import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  forwardRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import { FieldControl } from '~/app/common/components/forms/field-control';
import { FieldErrorComponent } from '~/app/common/components/forms/field-error/field-error.component';

/** Seleção do texto (`start` e `end` em unidades UTF-16, como o `selectionStart` do navegador). */
export interface TextSelection {
  readonly start: number;
  readonly end: number;
}

/**
 * Campo de texto de várias linhas (notas, descrições longas). O valor do controle é a string digitada
 * (`''` quando vazio); as regras (`required`, `maxLength`) vêm dos validators do `FormControl` e o erro
 * aparece só depois de `touched` (FieldError). Fonte de 16 px (o Safari do iPhone dá zoom abaixo disso) e
 * `resize` desligado (o controle nativo de redimensionar não existe aqui: use `rows` ou `fillHeight`).
 *
 * Para editores: `monospace`, atributos de lista de sugestões (`autocompleteList`, `ariaControls`,
 * `ariaActivedescendant`), os eventos `keyPressed` (antes de qualquer padrão do navegador; quem chama pode
 * `preventDefault`) e `selectionChanged`, e os métodos `focus()`, `selection()`, `setSelection()` e
 * `replaceRange()` (que preserva o desfazer nativo quando o navegador deixa). Presentational.
 */
@Component({
  selector: 'app-text-area',
  imports: [FieldErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.height]': "fillHeight() ? '100%' : null" },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TextAreaComponent), multi: true },
  ],
  template: `
    <div class="field area" [class.area--fill]="fillHeight()">
      <label
        class="field__label"
        [class.visually-hidden]="hideLabel()"
        [id]="labelId()"
        [for]="controlId()"
        >{{ label() }}</label
      >
      <textarea
        #area
        class="input area__input"
        [class.area__input--mono]="monospace()"
        [id]="controlId()"
        [attr.data-cy]="fieldId()"
        [attr.rows]="rows()"
        [attr.maxlength]="maxlength() ?? null"
        [attr.aria-controls]="ariaControls() ?? null"
        [attr.aria-activedescendant]="ariaActivedescendant() ?? null"
        [attr.aria-autocomplete]="autocompleteList() ? 'list' : null"
        [attr.aria-haspopup]="autocompleteList() ? 'listbox' : null"
        [attr.aria-required]="mandatory()"
        [attr.aria-invalid]="showError()"
        [attr.aria-describedby]="describedByAll()"
        [attr.enterkeyhint]="enterkeyhint() ?? null"
        [placeholder]="placeholder() ?? ''"
        [disabled]="disabled()"
        [attr.spellcheck]="spellcheck()"
        (input)="onInput($event)"
        (keydown)="keyPressed.emit($event)"
        (keyup)="selectionChanged.emit()"
        (click)="selectionChanged.emit()"
        (select)="selectionChanged.emit()"
        (focus)="focused.emit()"
        (blur)="onTouched()"
      ></textarea>
      @if (hint(); as text) {
        <p class="field__hint" [id]="hintId()">{{ text }}</p>
      }
      <app-field-error [control]="control()" [errorId]="errorId()" />
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .area__input {
      display: block;
      min-height: 5rem;
      padding: var(--space-3);
      line-height: var(--leading-normal);
      resize: none;
      tab-size: 2;
    }

    .area__input--mono {
      font-family: var(--font-mono);
      font-size: 1rem;
    }

    .area--fill {
      grid-template-rows: auto minmax(0, 1fr);
      height: 100%;
    }

    .area--fill .area__input {
      height: 100%;
    }

    .area__input:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }
  `,
})
export class TextAreaComponent extends FieldControl<string | null> {
  readonly rows = input(6);
  readonly maxlength = input<number>();
  readonly placeholder = input<string>();
  /** Só informa `aria-required`; a regra é o `Validators.required` do controle. */
  readonly mandatory = input(false);
  readonly monospace = input(false);
  /** Esconde o rótulo visualmente (continua sendo o nome acessível). */
  readonly hideLabel = input(false);
  /** Ocupa a altura do contêiner (editor em tela cheia). */
  readonly fillHeight = input(false);
  readonly spellcheck = input<'true' | 'false'>('true');
  readonly enterkeyhint = input<string>();
  /** Ids de ajuda extra (ex.: dica de atalhos) somados ao `aria-describedby`. */
  readonly describedByExtra = input<string>();
  /**
   * O campo tem uma lista de sugestões (`role="listbox"`) ao lado. O `<textarea>` não aceita `role="combobox"`
   * (axe `aria-allowed-role`): fica como caixa de texto com `aria-autocomplete="list"`, `aria-haspopup`,
   * `aria-controls` (só com a lista no DOM) e `aria-activedescendant` (a opção ativa).
   */
  readonly autocompleteList = input(false);
  readonly ariaControls = input<string>();
  readonly ariaActivedescendant = input<string>();

  /** Tecla pressionada, entregue antes do padrão do navegador (use `preventDefault()` para tomar a tecla). */
  readonly keyPressed = output<KeyboardEvent>();
  /** O cursor ou a seleção podem ter mudado (teclas, clique, seleção). */
  readonly selectionChanged = output<void>();
  readonly focused = output<void>();

  private readonly area = viewChild.required<ElementRef<HTMLTextAreaElement>>('area');
  protected readonly value = signal('');

  constructor() {
    super();
    // O valor entra no campo **só se for diferente** do que ele já mostra: reescrever o mesmo texto leva o cursor
    // para o fim em alguns navegadores (WebKit), e o editor acabou de posicionar a seleção.
    effect(() => {
      const next = this.value();
      const el = this.area().nativeElement;
      if (el.value !== next) el.value = next;
    });
  }

  protected describedByAll(): string | null {
    const ids = [this.describedBy(), this.describedByExtra()].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : null;
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.value.set(value);
    this.onChange(value);
    this.selectionChanged.emit();
  }

  focus(): void {
    this.area().nativeElement.focus();
  }

  selection(): TextSelection {
    const el = this.area().nativeElement;
    return { start: el.selectionStart, end: el.selectionEnd };
  }

  setSelection(start: number, end: number = start): void {
    const el = this.area().nativeElement;
    el.setSelectionRange(start, end);
  }

  /**
   * Troca `[start, end)` por `text` e deixa o cursor em `[selectStart, selectEnd]` (padrão: depois do texto).
   * Usa `insertText` quando o navegador tem, para o Ctrl/Cmd+Z desfazer a edição; senão escreve direto.
   */
  replaceRange(
    start: number,
    end: number,
    text: string,
    selectStart: number = start + text.length,
    selectEnd: number = selectStart,
  ): void {
    const el = this.area().nativeElement;
    el.focus();
    el.setSelectionRange(start, end);
    let done = false;
    const doc = el.ownerDocument;
    if (typeof doc.execCommand === 'function') {
      try {
        done = doc.execCommand('insertText', false, text);
      } catch {
        done = false;
      }
    }
    if (!done) {
      el.setRangeText(text, start, end, 'end');
      this.value.set(el.value);
      this.onChange(el.value);
    }
    el.setSelectionRange(selectStart, selectEnd);
    this.selectionChanged.emit();
  }
}
