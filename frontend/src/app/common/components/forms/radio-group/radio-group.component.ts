import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';

import {
  ChoiceOption,
  edgeEnabled,
  nextEnabled,
} from '~/app/common/components/forms/choice-option';
import { FieldControl } from '~/app/common/components/forms/field-control';
import { FieldErrorComponent } from '~/app/common/components/forms/field-error/field-error.component';

export type RadioLayout = 'vertical' | 'horizontal' | 'cards';

/**
 * Grupo de rádio próprio (padrão radio group do APG), no lugar de `<input type="radio">`:
 * `role="radiogroup"` nomeado pelo rótulo, itens `button role="radio"` com roving tabindex (Tab
 * entra no marcado ou, sem marcação, no primeiro habilitado), as setas movem **e** marcam, `Home`
 * e `End` vão às pontas, `Espaço` marca o item com foco, opções desabilitadas são puladas.
 * Diferente do `SegmentedControl` (poucas opções, sem descrição), mostra a descrição (`hint`) de
 * cada opção: `vertical` (lista), `horizontal` (quebra linha) ou `cards`. O estado nunca é só cor
 * (círculo preenchido, borda mais grossa no cartão, `forced-colors`). O valor é `string | null`.
 */
@Component({
  selector: 'app-radio-group',
  imports: [FieldErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RadioGroupComponent),
      multi: true,
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => RadioGroupComponent),
      multi: true,
    },
  ],
  template: `
    <div class="field">
      <span class="field__label" [id]="labelId()" [class.visually-hidden]="hideLabel()">{{
        label()
      }}</span>
      <div
        class="radios"
        role="radiogroup"
        [class.radios--horizontal]="layout() === 'horizontal'"
        [class.radios--cards]="layout() === 'cards'"
        [attr.aria-labelledby]="labelId()"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-required]="mandatory()"
        [attr.aria-invalid]="showError()"
        [attr.aria-disabled]="disabled() || null"
        [attr.data-cy]="fieldId()"
        (focusout)="onFocusOut($event)"
      >
        @for (option of options(); track option.value) {
          <button
            type="button"
            role="radio"
            class="radio"
            [id]="optionId(option)"
            [class.is-checked]="option.value === value()"
            [attr.aria-checked]="option.value === value()"
            [attr.aria-disabled]="option.disabled || null"
            [attr.aria-labelledby]="optionId(option) + '-label'"
            [attr.aria-describedby]="option.hint ? optionId(option) + '-hint' : null"
            [attr.lang]="option.lang ?? null"
            [disabled]="disabled()"
            [tabIndex]="option.value === tabStop() ? 0 : -1"
            [attr.data-cy]="fieldId() + '-' + option.value"
            (click)="select(option)"
            (keydown)="onKeydown($event)"
          >
            <span class="radio__mark" aria-hidden="true"><span class="radio__dot"></span></span>
            <span class="radio__text">
              <span class="radio__label" [id]="optionId(option) + '-label'">{{
                option.label
              }}</span>
              @if (option.hint) {
                <span class="radio__hint" [id]="optionId(option) + '-hint'">{{ option.hint }}</span>
              }
            </span>
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

    .radios {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .radios--horizontal {
      flex-flow: row wrap;
      gap: var(--space-1) var(--space-5);
    }

    .radios--cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
      gap: var(--space-2);
    }

    .radio {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      min-height: 2.75rem;
      padding: var(--space-3) var(--space-1);
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--color-text);
      font-size: var(--text-sm);
      text-align: left;
      -webkit-tap-highlight-color: transparent;
    }

    .radio:disabled,
    .radio[aria-disabled='true'] {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .radio__mark {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 1.375rem;
      height: 1.375rem;
      border: var(--border-width) solid var(--color-text-muted);
      border-radius: var(--radius-pill);
      background-color: var(--color-surface);
      transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
    }

    .radio__dot {
      width: 0.625rem;
      height: 0.625rem;
      border-radius: var(--radius-pill);
      background-color: transparent;
    }

    .radio:hover:not(:disabled, [aria-disabled='true']) .radio__mark {
      border-color: var(--color-hover-border);
    }

    .radio.is-checked .radio__mark {
      border-color: var(--color-accent);
    }

    .radio.is-checked .radio__dot {
      background-color: var(--color-accent);
    }

    .radio__text {
      display: grid;
      gap: 2px;
      min-width: 0;
      padding-top: 1px;
    }

    .radio__label {
      font-size: var(--text-md);
    }

    .radio__hint {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .radios--cards .radio {
      padding: var(--space-3) var(--space-4);
      border: var(--border-width) solid var(--color-control-border);
      border-radius: var(--radius-card);
      background-color: var(--color-surface);
    }

    .radios--cards .radio.is-checked {
      border-color: var(--color-accent);
      background-color: var(--color-surface-muted);
      box-shadow: inset 0 0 0 1px var(--color-accent);
    }

    .radios--cards .radio.is-checked:focus-visible {
      box-shadow:
        inset 0 0 0 1px var(--color-accent),
        var(--focus-ring);
    }

    .radios[aria-invalid='true'] .radio__mark {
      border-color: var(--color-risk);
    }

    @media (forced-colors: active) {
      .radio__mark {
        border-color: ButtonText;
      }

      .radio.is-checked .radio__dot {
        background-color: Highlight;
      }

      .radios--cards .radio.is-checked {
        border-color: Highlight;
        border-width: 3px;
      }
    }
  `,
})
export class RadioGroupComponent extends FieldControl<string | null> implements Validator {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly options = input.required<readonly ChoiceOption[]>();
  readonly layout = input<RadioLayout>('vertical');
  readonly mandatory = input(true);
  /** Esconde o rótulo visualmente (continua sendo o nome acessível do grupo). */
  readonly hideLabel = input(false);

  protected readonly value = signal<string | null>(null);

  /** Item que recebe o Tab: o marcado ou, sem marcação, o primeiro habilitado. */
  protected readonly tabStop = computed(() => {
    const options = this.options();
    const selected = options.find((o) => o.value === this.value() && !o.disabled);
    return selected?.value ?? options[edgeEnabled(options, 'first')]?.value ?? null;
  });

  writeValue(value: string | null): void {
    this.value.set(value);
  }

  validate(): ValidationErrors | null {
    return this.mandatory() && this.value() === null ? { required: true } : null;
  }

  protected optionId(option: ChoiceOption): string {
    return `${this.controlId()}-${option.value}`;
  }

  protected select(option: ChoiceOption): void {
    if (option.disabled || this.disabled() || option.value === this.value()) return;
    this.value.set(option.value);
    this.onChange(option.value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const options = this.options();
    const current = options.findIndex((o) => o.value === this.tabStop());
    let target: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        target = nextEnabled(options, current, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        target = nextEnabled(options, current, -1);
        break;
      case 'Home':
        target = edgeEnabled(options, 'first');
        break;
      case 'End':
        target = edgeEnabled(options, 'last');
        break;
      default:
        return;
    }
    event.preventDefault();
    const option = options[target];
    if (!option || this.disabled()) return;
    this.select(option);
    this.host.nativeElement
      .querySelector<HTMLElement>(`#${CSS.escape(this.optionId(option))}`)
      ?.focus();
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !this.host.nativeElement.contains(next)) this.onTouched();
  }
}
