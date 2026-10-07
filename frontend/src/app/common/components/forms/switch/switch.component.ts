import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import { FieldControl } from '~/app/common/components/forms/field-control';
import { I18nService } from '~/app/common/i18n/i18n.service';

/**
 * Interruptor próprio (padrão switch do APG): `button role="switch"`. O estado nunca depende só da
 * cor: a posição do botão muda e, com `showState`, o texto "Ligado"/"Desligado" acompanha.
 */
@Component({
  selector: 'app-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SwitchComponent), multi: true },
  ],
  template: `
    <button
      type="button"
      role="switch"
      class="switch"
      [id]="controlId()"
      [class.is-on]="on()"
      [attr.data-cy]="fieldId()"
      [attr.aria-checked]="on()"
      [attr.aria-describedby]="describedBy()"
      [disabled]="disabled()"
      (click)="toggle()"
      (blur)="onTouched()"
    >
      <span class="switch__label">{{ label() }}</span>
      @if (showState()) {
        <span class="switch__state" aria-hidden="true">{{
          on() ? t().form.ui.on : t().form.ui.off
        }}</span>
      }
      <span class="switch__track" aria-hidden="true"><span class="switch__thumb"></span></span>
    </button>
    @if (hint(); as text) {
      <p class="field__hint" [id]="hintId()">{{ text }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .switch {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 100%;
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

    .switch:disabled {
      opacity: 0.55;
    }

    .switch__label {
      flex: 1;
      min-width: 0;
    }

    .switch__state {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .switch__track {
      position: relative;
      flex: none;
      width: 2.5rem;
      height: 1.5rem;
      border: var(--border-width) solid var(--color-text-muted);
      border-radius: var(--radius-pill);
      background-color: var(--color-surface-muted);
      transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
    }

    .switch__thumb {
      position: absolute;
      top: 50%;
      left: 2px;
      width: 1.125rem;
      height: 1.125rem;
      border-radius: var(--radius-pill);
      background-color: var(--color-text-muted);
      transform: translateY(-50%);
      transition:
        transform var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard);
    }

    .switch.is-on .switch__track {
      border-color: var(--color-accent);
      background-color: var(--color-accent);
    }

    .switch.is-on .switch__thumb {
      background-color: var(--color-on-accent);
      transform: translate(1rem, -50%);
    }

    @media (forced-colors: active) {
      .switch.is-on .switch__track {
        background-color: Highlight;
      }

      .switch.is-on .switch__thumb {
        background-color: HighlightText;
      }
    }
  `,
})
export class SwitchComponent extends FieldControl<boolean> {
  protected readonly t = inject(I18nService).t;
  /** Mostra "Ligado/Desligado" ao lado do interruptor. */
  readonly showState = input(true);
  protected readonly on = signal(false);

  writeValue(value: boolean | null): void {
    this.on.set(value === true);
  }

  protected toggle(): void {
    if (this.disabled()) return;
    const next = !this.on();
    this.on.set(next);
    this.onChange(next);
  }
}
