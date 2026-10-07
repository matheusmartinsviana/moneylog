import { ChangeDetectionStrategy, Component, forwardRef, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import { FieldControl } from '~/app/common/components/forms/field-control';
import { IconComponent } from '~/app/common/components/icon/icon.component';

/**
 * Caixa de seleção própria (padrão checkbox do APG): um `button role="checkbox"` com `aria-checked`,
 * rótulo clicável, Espaço alterna. O valor do controle é `boolean`. Presentational.
 */
@Component({
  selector: 'app-checkbox',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CheckboxComponent), multi: true },
  ],
  template: `
    <button
      type="button"
      role="checkbox"
      class="checkbox"
      [id]="controlId()"
      [class.is-checked]="checked()"
      [attr.data-cy]="fieldId()"
      [attr.aria-checked]="checked()"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-invalid]="showError()"
      [disabled]="disabled()"
      (click)="toggle()"
      (blur)="onTouched()"
    >
      <span class="checkbox__box" aria-hidden="true">
        <app-icon name="check" [size]="14" />
      </span>
      <span class="checkbox__label">{{ label() }}</span>
    </button>
    @if (hint(); as text) {
      <p class="field__hint checkbox__hint" [id]="hintId()">{{ text }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .checkbox {
      display: inline-flex;
      align-items: center;
      gap: var(--space-3);
      min-height: 2.75rem;
      padding: 0 var(--space-1);
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--color-text);
      font-size: var(--text-sm);
      text-align: left;
      -webkit-tap-highlight-color: transparent;
    }

    .checkbox:disabled {
      opacity: 0.55;
    }

    .checkbox__box {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 1.375rem;
      height: 1.375rem;
      border: var(--border-width) solid var(--color-text-muted);
      border-radius: 6px;
      background-color: var(--color-surface);
      color: transparent;
      transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
    }

    .checkbox:hover:not(:disabled) .checkbox__box {
      border-color: var(--color-accent);
    }

    .checkbox.is-checked .checkbox__box {
      border-color: var(--color-accent);
      background-color: var(--color-accent);
      color: var(--color-on-accent);
    }

    .checkbox[aria-invalid='true'] .checkbox__box {
      border-color: var(--color-risk);
    }

    .checkbox__hint {
      padding-left: calc(1.375rem + var(--space-4));
    }

    @media (forced-colors: active) {
      .checkbox__box {
        border-color: ButtonText;
      }

      .checkbox.is-checked .checkbox__box {
        background-color: Highlight;
        color: HighlightText;
      }
    }
  `,
})
export class CheckboxComponent extends FieldControl<boolean> {
  protected readonly checked = signal(false);

  writeValue(value: boolean | null): void {
    this.checked.set(value === true);
  }

  protected toggle(): void {
    if (this.disabled()) return;
    const next = !this.checked();
    this.checked.set(next);
    this.onChange(next);
  }
}
