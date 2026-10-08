import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';

import { MonthGridComponent } from '~/app/common/components/calendar/month-grid.component';
import { FieldControl } from '~/app/common/components/forms/field-control';
import { FieldErrorComponent } from '~/app/common/components/forms/field-error/field-error.component';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { OverlayPanelComponent } from '~/app/common/components/overlay/overlay-panel.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { formatCompetence, todayIso } from '~/util/date';

/**
 * Seletor de mês/competência próprio: o valor do controle é `YYYY-MM` (ou `null`). Abre uma grade de
 * meses em popover (desktop) ou folha inferior (celular), com navegação de ano.
 */
@Component({
  selector: 'app-month-picker',
  imports: [FieldErrorComponent, IconComponent, OverlayPanelComponent, MonthGridComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MonthPickerComponent),
      multi: true,
    },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => MonthPickerComponent), multi: true },
  ],
  template: `
    <div class="field">
      <span class="field__label" [id]="labelId()">{{ label() }}</span>
      <button
        #trigger
        type="button"
        class="input month-trigger"
        aria-haspopup="dialog"
        [id]="controlId()"
        [class.is-open]="open()"
        [class.is-invalid]="showError()"
        [attr.data-cy]="fieldId()"
        [attr.aria-expanded]="open()"
        [attr.aria-labelledby]="labelId() + ' ' + valueId()"
        [attr.aria-describedby]="describedBy()"
        [disabled]="disabled()"
        (click)="toggle()"
        (blur)="onBlur()"
      >
        <span class="month-trigger__value num" [id]="valueId()" [class.is-placeholder]="!value()">{{
          display()
        }}</span>
        <app-icon class="month-trigger__icon" name="calendar" [size]="20" />
      </button>

      <app-overlay-panel
        [open]="open()"
        [anchor]="trigger"
        [label]="t().form.date.chooseMonth"
        [panelWidth]="288"
        [cy]="fieldId() + '-panel'"
        (closed)="open.set(false)"
      >
        @if (open()) {
          <app-month-grid
            #grid
            [value]="value()"
            [today]="currentMonth()"
            [min]="effectiveMin()"
            [max]="effectiveMax()"
            [cy]="fieldId() + '-grid'"
            (picked)="choose($event)"
          />
          @if (!mandatory()) {
            <div class="month-actions">
              <button
                type="button"
                class="month-actions__clear"
                [attr.data-cy]="fieldId() + '-clear'"
                (click)="clear()"
              >
                {{ t().form.ui.clear }}
              </button>
            </div>
          }
        }
      </app-overlay-panel>

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

    .month-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      text-align: left;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .month-trigger:hover:not(:disabled) {
      border-color: var(--color-hover-border);
    }

    .month-trigger.is-invalid {
      border-color: var(--color-risk);
    }

    .month-trigger.is-open {
      border-color: var(--color-accent);
    }

    .month-trigger__value {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .month-trigger__value::first-letter {
      text-transform: uppercase;
    }

    .month-trigger__value.is-placeholder {
      color: var(--color-text-muted);
    }

    .month-actions {
      display: flex;
      justify-content: flex-end;
      padding: 0 var(--space-3) var(--space-3);
    }

    .month-actions__clear {
      min-height: 2.75rem;
      padding: 0 var(--space-3);
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--color-text-muted);
      font-weight: var(--weight-medium);
    }

    .month-actions__clear:hover {
      background-color: var(--color-hover-soft);
      color: var(--color-text);
    }

    .month-trigger__icon {
      color: var(--color-text-muted);
    }
  `,
})
export class MonthPickerComponent extends FieldControl<string | null> implements Validator {
  private readonly i18n = inject(I18nService);
  private readonly ngInjector = inject(Injector);
  protected readonly t = this.i18n.t;

  /** Menor mês (`YYYY-MM`). */
  readonly min = input<string>();
  /** Maior mês (`YYYY-MM`). */
  readonly max = input<string>();
  readonly mandatory = input(true);

  protected readonly value = signal<string | null>(null);
  protected readonly open = signal(false);
  protected readonly valueId = computed(() => `${this.controlId()}-value`);
  /** Relido a cada abertura (o PWA pode atravessar a virada do mês). */
  protected readonly currentMonth = signal(todayIso().slice(0, 7));
  protected readonly effectiveMin = computed(() => this.min() ?? '2000-01');
  protected readonly effectiveMax = computed(() => this.max() ?? '2100-12');
  protected readonly display = computed(() => {
    const value = this.value();
    return value
      ? formatCompetence(value, HTML_LANG[this.i18n.language()])
      : this.t().form.date.monthPlaceholder;
  });

  private readonly grid = viewChild<MonthGridComponent>('grid');
  private validatorChange: () => void = () => undefined;
  private boundsApplied = false;

  constructor() {
    super();
    effect(() => {
      this.effectiveMin();
      this.effectiveMax();
      this.mandatory();
      if (this.boundsApplied) this.validatorChange();
      this.boundsApplied = true;
    });
    effect(() => {
      if (this.open()) {
        untracked(() => this.currentMonth.set(todayIso().slice(0, 7)));
        afterNextRender(() => this.grid()?.focusGrid(), { injector: this.ngInjector });
      }
    });
  }

  writeValue(value: string | null): void {
    this.value.set(value);
  }

  validate(): ValidationErrors | null {
    const value = this.value();
    if (value === null) return this.mandatory() ? { required: true } : null;
    const min = this.effectiveMin();
    const max = this.effectiveMax();
    // Meses `YYYY-MM` comparam como texto.
    if (value < min) return { monthMin: { min } };
    if (value > max) return { monthMax: { max } };
    return null;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.validatorChange = fn;
  }

  protected toggle(): void {
    if (!this.disabled()) this.open.update((open) => !open);
  }

  protected choose(month: string): void {
    this.value.set(month);
    this.onChange(month);
    this.open.set(false);
    this.validatorChange();
  }

  protected clear(): void {
    this.value.set(null);
    this.onChange(null);
    this.open.set(false);
    this.validatorChange();
  }

  protected onBlur(): void {
    if (!this.open()) this.onTouched();
  }
}
