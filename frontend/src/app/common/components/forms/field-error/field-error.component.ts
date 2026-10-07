import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AbstractControl, ValidationErrors } from '@angular/forms';

import { isErrorVisible, watchControl } from '~/app/common/components/forms/field-control';
import { AppI18n, HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { formatCompetence, formatIsoDate } from '~/util/date';

type ErrorMessages = AppI18n['form']['errors'];

/** Texto do primeiro erro do controle, a partir do contrato de i18n. */
export function errorMessage(
  errors: ValidationErrors,
  messages: ErrorMessages,
  locale: string,
  serverCodes: Readonly<Record<string, string>> = {},
): string {
  const [key, detail] = Object.entries(errors)[0] ?? [];
  const param = (name: string): string => String((detail as Record<string, unknown>)?.[name] ?? '');
  switch (key) {
    case 'required':
      return messages.required;
    case 'moneyFormat':
      return interpolate(messages.moneyFormat, { example: param('example') });
    case 'moneyScale':
      return interpolate(messages.moneyScale, { digits: param('digits') });
    case 'moneyNegative':
      return messages.moneyNegative;
    case 'moneyZero':
      return messages.moneyZero;
    case 'dateFormat':
      return messages.dateFormat;
    case 'dateMin':
      return interpolate(messages.dateMin, { date: formatIsoDate(param('min'), locale, 'long') });
    case 'dateMax':
      return interpolate(messages.dateMax, { date: formatIsoDate(param('max'), locale, 'long') });
    case 'monthMin':
      return interpolate(messages.monthMin, { month: formatCompetence(param('min'), locale) });
    case 'monthMax':
      return interpolate(messages.monthMax, { month: formatCompetence(param('max'), locale) });
    // Erro devolvido pelo backend (`code` do contrato): traduzido pelo `code`, nunca pela mensagem dele.
    case 'server':
      return serverCodes[String(detail)] ?? messages.invalid;
    case 'maxlength':
      return interpolate(messages.maxlength, { max: param('requiredLength') });
    default:
      return messages.invalid;
  }
}

/**
 * Mensagem de erro de um campo (FE 02): só aparece depois que o controle foi tocado (inclusive pelo
 * `markAllAsTouched()` do salvar). O campo aponta para `errorId` no `aria-describedby`.
 */
@Component({
  selector: 'app-field-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message(); as text) {
      <p class="field-error" [id]="errorId()" [attr.data-cy]="errorId()">{{ text }}</p>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .field-error {
      color: var(--color-risk);
      font-size: var(--text-xs);
      line-height: var(--leading-normal);
    }
  `,
})
export class FieldErrorComponent {
  private readonly i18n = inject(I18nService);

  /** Controle observado (`null` enquanto o campo ainda não está ligado ao formulário). */
  readonly control = input.required<AbstractControl | null>();
  /** Id do parágrafo de erro, o mesmo usado no `aria-describedby` do campo. */
  readonly errorId = input.required<string>();

  private readonly state = watchControl(this.control);

  protected readonly message = computed(() => {
    const state = this.state();
    if (!isErrorVisible(state) || !state.errors) return null;
    const t = this.i18n.t();
    return errorMessage(
      state.errors,
      t.form.errors,
      HTML_LANG[this.i18n.language()],
      t.errors.codes,
    );
  });
}
