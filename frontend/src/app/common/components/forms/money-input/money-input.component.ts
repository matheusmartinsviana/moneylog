import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';

import { FieldControl } from '~/app/common/components/forms/field-control';
import { FieldErrorComponent } from '~/app/common/components/forms/field-error/field-error.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import {
  AmountResult,
  AmountRules,
  amountScale,
  currencySymbol,
  formatAmountInput,
  normalizeAmount,
  parseAmountInput,
} from '~/util/money-input';

const PERMISSIVE: AmountRules = { allowNegative: true, allowZero: true };

/**
 * Campo de valor monetário (T32). O valor do controle é a string decimal da API (`"1234.50"`) ou
 * `null` enquanto o texto é inválido; nunca um `number`. Separadores e símbolo seguem a moeda do
 * dado (FE 04). O texto é reformatado ao sair do campo (`1.234,5` → `1.234,50`).
 */
@Component({
  selector: 'app-money-input',
  imports: [FieldErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MoneyInputComponent),
      multi: true,
    },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => MoneyInputComponent), multi: true },
  ],
  templateUrl: './money-input.component.html',
  styleUrl: './money-input.component.css',
})
export class MoneyInputComponent extends FieldControl<string | null> implements Validator {
  private readonly i18n = inject(I18nService);

  /** Moeda do dado (ISO 4217), não a do idioma. */
  readonly currency = input('BRL');
  readonly allowNegative = input(false);
  readonly allowZero = input(false);
  readonly mandatory = input(true);

  protected readonly text = signal('');
  private readonly result = signal<AmountResult>({ ok: false, error: 'required' });
  private emitted: string | null = null;
  private rulesApplied = false;
  private validatorChange: () => void = () => undefined;

  private readonly rules = computed<AmountRules>(() => ({
    allowNegative: this.allowNegative(),
    allowZero: this.allowZero(),
  }));
  protected readonly symbol = computed(() => currencySymbol(this.currency()));
  protected readonly placeholder = computed(() => formatAmountInput('0', this.currency()));
  protected readonly currencyId = computed(() => `${this.controlId()}-currency`);
  protected readonly currencyText = computed(() => {
    const locale = HTML_LANG[this.i18n.language()];
    const name =
      new Intl.DisplayNames([locale], { type: 'currency' }).of(this.currency()) ?? this.currency();
    return interpolate(this.i18n.t().form.amountCurrency, { currency: name });
  });
  protected readonly inputDescribedBy = computed(() =>
    [this.currencyId(), this.describedBy()].filter(Boolean).join(' '),
  );

  constructor() {
    super();
    // Moeda ou regras mudaram: revalida o texto atual e avisa o formulário.
    effect(() => {
      const currency = this.currency();
      const rules = this.rules();
      const text = untracked(this.text);
      // A primeira execução só registra as regras iniciais: o formulário já validou com elas.
      if (!this.rulesApplied || text === '') {
        this.rulesApplied = true;
        return;
      }
      this.apply(parseAmountInput(text, currency, rules));
      this.validatorChange();
    });
  }

  writeValue(value: string | null): void {
    const result = normalizeAmount(value, this.currency(), this.rules());
    this.result.set(result);
    this.emitted = result.ok ? result.value : null;
    const shown = normalizeAmount(value, this.currency(), PERMISSIVE);
    this.text.set(shown.ok ? formatAmountInput(shown.value, this.currency()) : (value ?? ''));
  }

  validate(): ValidationErrors | null {
    const result = this.result();
    if (result.ok) return null;
    switch (result.error) {
      case 'required':
        return this.mandatory() ? { required: true } : null;
      case 'format':
        return { moneyFormat: { example: formatAmountInput('1234.56', this.currency()) } };
      case 'scale':
        return { moneyScale: { digits: amountScale(this.currency()) } };
      case 'negative':
        return { moneyNegative: true };
      case 'zero':
        return { moneyZero: true };
    }
  }

  registerOnValidatorChange(fn: () => void): void {
    this.validatorChange = fn;
  }

  protected onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.text.set(text);
    this.apply(parseAmountInput(text, this.currency(), this.rules()));
  }

  protected onBlur(): void {
    const result = this.result();
    if (result.ok) this.text.set(formatAmountInput(result.value, this.currency()));
    this.onTouched();
  }

  private apply(result: AmountResult): void {
    this.result.set(result);
    const value = result.ok ? result.value : null;
    // Mesmo valor (ex.: `1.234,5` → `1.234,50`) não dispara outra mudança no formulário.
    if (value === this.emitted && value !== null) return;
    this.emitted = value;
    this.onChange(value);
  }
}
