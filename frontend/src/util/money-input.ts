/**
 * Entrada de valores monetários digitados pelo usuário (T32).
 *
 * O texto digitado vira a string decimal canônica da API (`"1234.50"`, D2 §4) só com manipulação de
 * string: nenhum valor passa por `number`, `parseFloat` ou `Number()` (arquitetura §1). O ESLint
 * proíbe essas construções neste arquivo e no `MoneyInput`.
 *
 * Os separadores seguem o locale da **moeda do dado** (FE 04), igual a `formatMoney`: um valor em BRL
 * aceita `1.234,56` mesmo com a interface em inglês.
 */
import { CURRENCY_LOCALE, FALLBACK_MONEY_LOCALE } from '~/util/money';

export type AmountError = 'required' | 'format' | 'scale' | 'negative' | 'zero';

export interface AmountRules {
  /** Aceita valor negativo (ex.: saldo inicial). Padrão: não. */
  readonly allowNegative?: boolean;
  /** Aceita zero (ex.: saldo inicial). Padrão: não. */
  readonly allowZero?: boolean;
}

export type AmountResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: AmountError };

export interface DecimalSymbols {
  readonly decimal: string;
  readonly group: string;
}

const MINUS = /^[-−]/;
const DIGITS = /^\d*$/;
const ONLY_ZEROS = /^0*$/;
const CANONICAL = /^(-?)(\d+)(?:\.(\d+))?$/;
const symbolsCache = new Map<string, DecimalSymbols>();

/** Locale que define os separadores do campo: o da moeda (BRL → pt-BR). */
export function amountLocale(currency: string): string {
  return CURRENCY_LOCALE[currency] ?? FALLBACK_MONEY_LOCALE;
}

/** Separador decimal e de milhar do locale da moeda (`,` e `.` em pt-BR). */
export function decimalSymbols(currency: string): DecimalSymbols {
  const locale = amountLocale(currency);
  let symbols = symbolsCache.get(locale);
  if (!symbols) {
    const parts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(
      '1234.5' as Intl.StringNumericLiteral,
    );
    symbols = {
      decimal: parts.find((part) => part.type === 'decimal')?.value ?? ',',
      group: parts.find((part) => part.type === 'group')?.value ?? '.',
    };
    symbolsCache.set(locale, symbols);
  }
  return symbols;
}

/** Casas decimais da moeda (2 para BRL). */
function scaleOf(currency: string) {
  return (
    new Intl.NumberFormat(amountLocale(currency), { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/** Quantidade de casas decimais aceitas na moeda, como texto (usada nas mensagens). */
export function amountScale(currency: string): string {
  return String(scaleOf(currency));
}

function escape(symbol: string): string {
  return symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function count(text: string, symbol: string) {
  return text.split(symbol).length - 1;
}

/** Valida as partes já separadas e monta a string canônica com as casas da moeda. */
function build(
  negative: boolean,
  integer: string,
  fraction: string,
  currency: string,
  rules: AmountRules,
): AmountResult {
  const scale = scaleOf(currency);
  if (fraction.length > scale) return { ok: false, error: 'scale' };
  const digits = integer.replace(/^0+(?=\d)/, '') || '0';
  const decimals = fraction.padEnd(scale, '0');
  const zero = ONLY_ZEROS.test(digits) && ONLY_ZEROS.test(decimals);
  if (zero && !rules.allowZero) return { ok: false, error: 'zero' };
  if (negative && !zero && !rules.allowNegative) return { ok: false, error: 'negative' };
  const sign = negative && !zero ? '-' : '';
  return { ok: true, value: decimals ? `${sign}${digits}.${decimals}` : `${sign}${digits}` };
}

/**
 * Converte o texto digitado na string decimal canônica.
 *
 * - Aceita os separadores do locale da moeda (`1.234,5` em BRL) e ignora espaços e o símbolo da moeda.
 * - O separador de milhar só vale em grupos de 3 dígitos (`1.234`, `12.345.678`).
 * - Sem separador decimal, um único separador de milhar seguido de 1 ou 2 dígitos é lido como decimal
 *   (`18.5` em BRL = `18.50`): é o que o teclado decimal de um aparelho em outro idioma digita.
 * - Ambiguidade de `1.500` (decisão conservadora): ponto seguido de **exatamente 3 dígitos** é milhar
 *   (`1.500` = 1500,00), nunca decimal; é a leitura de quem digita em pt-BR e evita gravar mil vezes
 *   menos. Quem quer 1,5 digita `1,5` (ou `1.5`/`1.50`, 1 ou 2 dígitos). Três casas decimais não
 *   existem em BRL, então não há outra leitura válida.
 * - Mais casas que a moeda permite, letras, sinal no meio ou vazio são erro (nunca arredonda).
 */
export function parseAmountInput(
  text: string,
  currency: string,
  rules: AmountRules = {},
): AmountResult {
  const { decimal, group } = decimalSymbols(currency);
  // `\s` cobre também o espaço não separável que o `Intl` usa depois do símbolo.
  let raw = text.replace(/\s/g, '').replace(currencySymbol(currency), '');
  if (raw === '') return { ok: false, error: 'required' };

  const negative = MINUS.test(raw);
  if (negative) raw = raw.slice(1);
  if (raw === '' || !new RegExp(`^[\\d${escape(decimal)}${escape(group)}]+$`).test(raw)) {
    return { ok: false, error: 'format' };
  }

  let integer = raw;
  let fraction = '';
  const decimals = count(raw, decimal);
  if (decimals > 1) return { ok: false, error: 'format' };
  if (decimals === 1) {
    [integer = '', fraction = ''] = raw.split(decimal);
  } else if (count(raw, group) === 1 && /^\d{1,2}$/.test(raw.split(group)[1] ?? '')) {
    [integer = '', fraction = ''] = raw.split(group);
  }

  if (!DIGITS.test(fraction)) return { ok: false, error: 'format' };
  if (integer.includes(group)) {
    if (!new RegExp(`^\\d{1,3}(?:${escape(group)}\\d{3})+$`).test(integer)) {
      return { ok: false, error: 'format' };
    }
    integer = integer.split(group).join('');
  }
  if (!DIGITS.test(integer) || (integer === '' && fraction === '')) {
    return { ok: false, error: 'format' };
  }
  return build(negative, integer, fraction, currency, rules);
}

/**
 * Valida e normaliza um valor canônico vindo do modelo (`"1234.5"` → `"1234.50"`), com as mesmas
 * regras do texto digitado. Valor fora do formato da API é `format`.
 */
export function normalizeAmount(
  value: string | null | undefined,
  currency: string,
  rules: AmountRules = {},
): AmountResult {
  if (value === null || value === undefined || value === '') {
    return { ok: false, error: 'required' };
  }
  const match = CANONICAL.exec(value);
  if (!match) return { ok: false, error: 'format' };
  return build(match[1] === '-', match[2] ?? '', match[3] ?? '', currency, rules);
}

/**
 * Exibe um valor canônico no campo, com os separadores da moeda e sem o símbolo
 * (`"1234.50"` → `1.234,50`). A string vai direto para o `Intl` (sem `Number()`), então não há
 * arredondamento: o valor já chega com as casas da moeda.
 */
export function formatAmountInput(value: string, currency: string): string {
  const scale = scaleOf(currency);
  return new Intl.NumberFormat(amountLocale(currency), {
    useGrouping: true,
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(value as Intl.StringNumericLiteral);
}

/** Símbolo da moeda no locale dela (`R$` para BRL), para o prefixo visual do campo. */
export function currencySymbol(currency: string): string {
  return (
    new Intl.NumberFormat(amountLocale(currency), { style: 'currency', currency })
      .formatToParts('0' as Intl.StringNumericLiteral)
      .find((part) => part.type === 'currency')?.value ?? currency
  );
}
