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

import {
  dateOrder,
  formatMasked,
  MAX_DATE,
  MIN_DATE,
  maskDigits,
  parseMasked,
  addDays,
} from '~/app/common/components/calendar/calendar-math';
import { CalendarComponent } from '~/app/common/components/calendar/calendar.component';
import { FieldControl } from '~/app/common/components/forms/field-control';
import { FieldErrorComponent } from '~/app/common/components/forms/field-error/field-error.component';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { OverlayPanelComponent } from '~/app/common/components/overlay/overlay-panel.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { todayIso } from '~/util/date';

/**
 * Campo de data próprio: digitação com máscara (`dd/mm/aaaa`, `mm/dd/aaaa` em inglês) e calendário
 * em popover (desktop) ou folha inferior (celular). O valor do controle é `YYYY-MM-DD` (formato da
 * API) ou `null`; os limites padrão são os do backend (2000-01-01 a 2100-12-31). "Hoje" vem do
 * fuso do usuário (S-1). Valida 31/02, data incompleta e fora do intervalo com erro de campo (sem
 * bolha do navegador). O padrão "hoje" é de quem cria o formulário: `new FormControl(todayIso())`.
 */
@Component({
  selector: 'app-date-picker',
  imports: [FieldErrorComponent, IconComponent, OverlayPanelComponent, CalendarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DatePickerComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DatePickerComponent), multi: true },
  ],
  template: `
    <div class="field">
      <label class="field__label" [id]="labelId()" [for]="controlId()">{{ label() }}</label>
      <div
        #box
        class="input date-box"
        [class.is-invalid]="showError()"
        [class.is-disabled]="disabled()"
        (focusout)="onFocusOut($event)"
      >
        <input
          class="date-box__input num"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          maxlength="10"
          [id]="controlId()"
          [attr.data-cy]="fieldId()"
          [placeholder]="t().form.date.placeholder"
          [value]="text()"
          [disabled]="disabled()"
          [attr.aria-required]="mandatory()"
          [attr.aria-invalid]="showError()"
          [attr.aria-describedby]="describedByWithFormat()"
          (input)="onInput($event)"
          (keydown)="onKeydown($event)"
        />
        <button
          type="button"
          class="date-box__button"
          aria-haspopup="dialog"
          [attr.aria-expanded]="open()"
          [attr.aria-label]="t().form.date.openCalendar"
          [attr.data-cy]="fieldId() + '-calendar'"
          [disabled]="disabled()"
          (click)="toggle()"
        >
          <app-icon name="calendar" [size]="20" />
        </button>
      </div>
      <span class="visually-hidden" [id]="formatId()">{{ formatHint() }}</span>

      <app-overlay-panel
        [open]="open()"
        [anchor]="box"
        [label]="t().form.date.chooseDate"
        [cy]="fieldId() + '-panel'"
        align="end"
        [panelWidth]="320"
        (closed)="open.set(false)"
      >
        @if (open()) {
          <app-calendar
            #calendar
            [value]="value()"
            [today]="today()"
            [min]="effectiveMin()"
            [max]="effectiveMax()"
            [cy]="fieldId() + '-cal'"
            (picked)="choose($event)"
          />
          <div class="date-box__actions">
            <button
              type="button"
              class="date-box__shortcut"
              [attr.data-cy]="fieldId() + '-today'"
              [disabled]="!inRange(today())"
              (click)="choose(today())"
            >
              {{ t().form.date.today }}
            </button>
            <button
              type="button"
              class="date-box__shortcut"
              [attr.data-cy]="fieldId() + '-yesterday'"
              [disabled]="!inRange(yesterday())"
              (click)="choose(yesterday())"
            >
              {{ t().form.date.yesterday }}
            </button>
            @if (!mandatory()) {
              <button
                type="button"
                class="date-box__shortcut"
                [attr.data-cy]="fieldId() + '-clear'"
                (click)="clear()"
              >
                {{ t().form.ui.clear }}
              </button>
            }
          </div>
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

    .date-box {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      padding-right: var(--space-1);
    }

    .date-box:focus-within {
      border-color: var(--color-accent);
    }

    .date-box.is-invalid {
      border-color: var(--color-risk);
    }

    .date-box.is-disabled {
      opacity: 0.55;
    }

    .date-box__input {
      flex: 1;
      width: 0;
      min-width: 0;
      min-height: 2.5rem;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--color-text);
      /* 16px: abaixo disso o Safari do iPhone dá zoom ao focar. */
      font-size: 1rem;
    }

    .date-box__input::placeholder {
      color: var(--color-text-muted);
    }

    .date-box__input:focus-visible {
      box-shadow: none;
    }

    .date-box__button {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      border: 0;
      border-radius: calc(var(--radius-control) - 2px);
      background: transparent;
      color: var(--color-text-muted);
    }

    .date-box__button:hover:not(:disabled),
    .date-box__button[aria-expanded='true'] {
      background-color: var(--color-hover-soft);
      color: var(--color-text);
    }

    .date-box__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      padding: 0 var(--space-3) var(--space-3);
    }

    .date-box__shortcut {
      min-height: 2.75rem;
      padding: 0 var(--space-4);
      border: var(--border-width) solid var(--color-control-border);
      border-radius: var(--radius-control);
      background-color: var(--color-surface);
      color: var(--color-text);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
    }

    .date-box__shortcut:hover:not(:disabled) {
      background-color: var(--color-hover-soft);
    }

    .date-box__shortcut:disabled {
      opacity: 0.45;
    }

    @media (width >= 641px) {
      .date-box__shortcut {
        min-height: 2.25rem;
      }
    }
  `,
})
export class DatePickerComponent extends FieldControl<string | null> implements Validator {
  private readonly i18n = inject(I18nService);
  private readonly ngInjector = inject(Injector);
  protected readonly t = this.i18n.t;

  /** Menor data aceita (`YYYY-MM-DD`), inclusive. Padrão: 2000-01-01 (backend). */
  readonly min = input<string | undefined>(undefined);
  /** Maior data aceita (`YYYY-MM-DD`), inclusive. Padrão: 2100-12-31 (backend). */
  readonly max = input<string | undefined>(undefined);
  readonly mandatory = input(true);

  protected readonly value = signal<string | null>(null);
  protected readonly text = signal('');
  protected readonly open = signal(false);

  protected readonly effectiveMin = computed(() => this.min() ?? MIN_DATE);
  protected readonly effectiveMax = computed(() => this.max() ?? MAX_DATE);
  /** "Hoje" é relido a cada abertura: um PWA aberto atravessando a meia-noite não fica com o dia velho. */
  protected readonly today = signal(todayIso());
  protected readonly yesterday = computed(() => addDays(this.today(), -1));
  private readonly order = computed(() => dateOrder(this.i18n.language()));
  protected readonly formatId = computed(() => `${this.controlId()}-format`);
  protected readonly formatHint = computed(() =>
    interpolate(this.t().form.date.formatHint, { format: this.t().form.date.placeholder }),
  );
  protected readonly describedByWithFormat = computed(() =>
    [this.describedBy(), this.formatId()].filter(Boolean).join(' '),
  );

  private readonly calendar = viewChild<CalendarComponent>('calendar');
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
    // Troca de idioma: o mesmo valor, na ordem do novo idioma.
    effect(() => {
      const order = this.order();
      untracked(() => {
        const value = this.value();
        if (value) this.text.set(formatMasked(value, order));
      });
    });
    effect(() => {
      if (this.open()) {
        untracked(() => this.today.set(todayIso()));
        afterNextRender(() => this.calendar()?.focusGrid(), { injector: this.ngInjector });
      }
    });
  }

  writeValue(value: string | null): void {
    this.value.set(value);
    this.text.set(value ? formatMasked(value, this.order()) : '');
  }

  validate(): ValidationErrors | null {
    if (this.text() === '') return this.mandatory() ? { required: true } : null;
    const value = this.value();
    if (value === null) return { dateFormat: true };
    const min = this.effectiveMin();
    const max = this.effectiveMax();
    // Datas ISO comparam como texto.
    if (value < min) return { dateMin: { min } };
    if (value > max) return { dateMax: { max } };
    return null;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.validatorChange = fn;
  }

  protected inRange(iso: string): boolean {
    return iso >= this.effectiveMin() && iso <= this.effectiveMax();
  }

  protected toggle(): void {
    if (this.disabled()) return;
    this.open.update((open) => !open);
  }

  protected choose(iso: string): void {
    this.apply(formatMasked(iso, this.order()), iso);
    this.open.set(false);
    // Escolher no calendário é uma interação completa: o erro (se houver) já pode aparecer.
    this.onTouched();
  }

  protected clear(): void {
    this.apply('', null);
    this.open.set(false);
    this.onTouched();
  }

  protected onFocusOut(event: FocusEvent): void {
    const box = event.currentTarget as HTMLElement;
    // Do campo para o botão do calendário (ou de volta) não é "sair": o erro só aparece depois.
    if (box.contains(event.relatedTarget as Node | null) || this.open()) return;
    this.onTouched();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      this.open.set(true);
    }
  }

  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value;
    const inputType = (event as InputEvent).inputType ?? '';
    let masked: string;
    const isoPaste = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
    if (isoPaste) {
      // Colar `2026-10-04` (formato da API) também funciona.
      masked = formatMasked(raw.trim(), this.order()) || maskDigits(raw);
    } else {
      let digits = raw.replace(/\D/g, '');
      // Apagar uma barra não pode "travar" a máscara: apaga o dígito anterior.
      if (inputType.startsWith('delete') && digits === this.text().replace(/\D/g, '')) {
        digits = digits.slice(0, -1);
      }
      masked = maskDigits(digits);
    }
    const caret = input.selectionStart ?? raw.length;
    const digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length;
    input.value = masked;
    const position = this.caretFor(masked, digitsBefore, caret >= raw.length);
    input.setSelectionRange?.(position, position);
    const iso = masked.length === 10 ? parseMasked(masked, this.order()) : null;
    this.apply(masked, iso);
  }

  private apply(text: string, value: string | null): void {
    this.text.set(text);
    this.value.set(value);
    this.onChange(value);
  }

  private caretFor(masked: string, digitsBefore: number, atEnd: boolean): number {
    if (atEnd) return masked.length;
    let seen = 0;
    for (let i = 0; i < masked.length; i++) {
      if (seen === digitsBefore) return i;
      if (/\d/.test(masked.charAt(i))) seen++;
    }
    return masked.length;
  }
}
