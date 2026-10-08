import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import { FieldControl } from '~/app/common/components/forms/field-control';
import { FieldErrorComponent } from '~/app/common/components/forms/field-error/field-error.component';

export type TextFieldType = 'text' | 'email' | 'password';

/**
 * Campo de texto de uma linha (nome, descrição, e-mail, senha, busca). O valor do controle é a
 * string digitada (`''` quando vazio); as regras (`required`, `maxLength`, `email`) vêm dos
 * validators do `FormControl`, e o erro aparece só depois de `touched` (FieldError). Presentational.
 */
@Component({
  selector: 'app-text-field',
  imports: [FieldErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TextFieldComponent), multi: true },
  ],
  template: `
    <div class="field">
      <label
        class="field__label"
        [class.visually-hidden]="hideLabel()"
        [id]="labelId()"
        [for]="controlId()"
        >{{ label() }}</label
      >
      <div class="field__control">
        <input
          class="input"
          [class.input--mono]="mono()"
          [class.input--revealable]="revealable()"
          [type]="revealable() && revealed() ? 'text' : type()"
          [id]="controlId()"
          [attr.data-cy]="fieldId()"
          [attr.data-autofocus]="autofocus() ? '' : null"
          [attr.autocomplete]="autocomplete() ?? null"
          [attr.maxlength]="maxlength() ?? null"
          [attr.inputmode]="inputmode() ?? null"
          [attr.enterkeyhint]="enterkeyhint() ?? null"
          [attr.role]="role() ?? null"
          [attr.aria-controls]="ariaControls() ?? null"
          [attr.aria-expanded]="ariaExpanded()"
          [attr.aria-activedescendant]="ariaActivedescendant() ?? null"
          [attr.aria-autocomplete]="role() === 'combobox' ? 'list' : null"
          [placeholder]="placeholder() ?? ''"
          [value]="value()"
          [disabled]="disabled()"
          [attr.aria-required]="mandatory()"
          [attr.aria-invalid]="showError()"
          [attr.aria-describedby]="describedBy()"
          spellcheck="false"
          (input)="onInput($event)"
          (blur)="onTouched()"
        />
        @if (revealable()) {
          <button
            type="button"
            class="field__reveal"
            [attr.data-cy]="fieldId() + '-reveal'"
            [attr.aria-pressed]="revealed()"
            [attr.aria-controls]="controlId()"
            [attr.aria-label]="revealed() ? hideLabelText() : showLabelText()"
            (click)="revealed.set(!revealed())"
          >
            {{ revealed() ? hideLabelText() : showLabelText() }}
          </button>
        }
      </div>
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

    .field__control {
      position: relative;
      display: grid;
    }

    .input--mono {
      font-family: var(--font-mono, ui-monospace, monospace);
      letter-spacing: 0.02em;
    }

    .input--revealable {
      padding-right: 5.5rem;
    }

    .field__reveal {
      position: absolute;
      top: 50%;
      right: var(--space-2);
      transform: translateY(-50%);
      min-height: 2rem;
      padding: 0 var(--space-2);
      border-radius: var(--radius-control);
      color: var(--color-text-muted);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
    }

    .field__reveal:hover {
      color: var(--color-text);
    }
  `,
})
export class TextFieldComponent extends FieldControl<string | null> {
  readonly type = input<TextFieldType>('text');
  readonly autocomplete = input<string>();
  readonly maxlength = input<number>();
  readonly inputmode = input<string>();
  readonly enterkeyhint = input<string>();
  /** Papel próprio (ex.: `searchbox` na busca); a busca nunca usa `type="search"` (controle nativo). */
  readonly role = input<string>();
  /** Combobox (`role="combobox"`): a lista de opções que o campo controla, se ela está aberta e a opção ativa. */
  readonly ariaControls = input<string>();
  readonly ariaExpanded = input<boolean | null>(null);
  readonly ariaActivedescendant = input<string>();
  readonly placeholder = input<string>();
  /** Esconde o rótulo visualmente (ele continua sendo o nome acessível do campo). */
  readonly hideLabel = input(false);
  /** Recebe o foco quando a folha/diálogo que o contém abre (`data-autofocus`). */
  readonly autofocus = input(false);
  /** Só informa `aria-required`; a regra é o `Validators.required` do controle. */
  readonly mandatory = input(true);

  /** Campo de senha com "Mostrar/Ocultar" (botão próprio, `aria-pressed`). Só faz sentido em `password`. */
  readonly revealable = input(false);
  readonly showLabelText = input('Show');
  readonly hideLabelText = input('Hide');
  /** Fonte monoespaçada (códigos). */
  readonly mono = input(false);

  protected readonly revealed = signal(false);
  protected readonly value = signal('');

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.value.set(value);
    this.onChange(value);
  }
}
