/**
 * Dinheiro como trafega na API (D2 §4): `amount` é string decimal e `currency` é ISO 4217.
 * O front só formata: nunca soma, subtrai, arredonda nem converte para `number` (arquitetura §1).
 */
export interface Money {
  readonly amount: string;
  readonly currency: string;
}

/**
 * Locale de formatação pela moeda do dado, não pelo idioma da UI (FE 04):
 * uma conta em BRL mostra `R$ 1.234,56` mesmo com a interface em inglês.
 */
export const CURRENCY_LOCALE: Readonly<Record<string, string>> = {
  BRL: 'pt-BR',
  USD: 'en-US',
};

/** Locale usado para moedas sem mapeamento explícito (só BRL no MVP, S-2). */
export const FALLBACK_MONEY_LOCALE = 'pt-BR';

/** Sinal de menos tipográfico (U+2212), usado no lugar do hífen em valores negativos. */
export const TYPOGRAPHIC_MINUS = '−';

const DECIMAL = /^-?\d+(?:\.(\d+))?$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string, fractionDigits: number): Intl.NumberFormat {
  const key = `${currency}:${fractionDigits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    const locale = CURRENCY_LOCALE[currency] ?? FALLBACK_MONEY_LOCALE;
    const currencyDigits =
      new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      // Nunca arredonda: mostra todas as casas que vierem da API (no mínimo as da moeda).
      minimumFractionDigits: currencyDigits,
      maximumFractionDigits: Math.max(currencyDigits, fractionDigits),
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Formata um `Money` na moeda e no locale do dado. A string decimal vai direto para o
 * `Intl.NumberFormat` (sem `Number()`), então não há perda de precisão nem arredondamento.
 * Valor fora do formato esperado volta sem formatação, para o erro ficar visível.
 */
export function formatMoney(money: Money): string {
  const match = DECIMAL.exec(money.amount);
  if (!match || !CURRENCY_CODE.test(money.currency)) {
    return `${money.amount} ${money.currency}`;
  }
  const fractionDigits = match[1]?.length ?? 0;
  return formatterFor(money.currency, fractionDigits)
    .formatToParts(money.amount as Intl.StringNumericLiteral)
    .map((part) => (part.type === 'minusSign' ? TYPOGRAPHIC_MINUS : part.value))
    .join('');
}

const NEGATIVE_ZERO = /^-0+(?:\.0+)?$/;

/**
 * O valor vindo da API é negativo? Lê só o sinal da string (sem `Number()` e sem cálculo), para a
 * tela destacar risco (DS 00: vermelho discreto só para risco ou saldo negativo).
 */
export function isNegative(money: Money): boolean {
  return money.amount.startsWith('-') && !NEGATIVE_ZERO.test(money.amount);
}

/**
 * O valor vindo da API é positivo? Lê só o texto (sem `Number()` e sem cálculo), para a tela decidir se
 * mostra uma linha opcional (ex.: "crédito no cartão" só quando há crédito).
 */
export function isPositive(money: Money): boolean {
  return !money.amount.startsWith('-') && /[1-9]/.test(money.amount);
}

/**
 * O mesmo valor sem o sinal de menos, só para frases em que o sentido já está no texto ("você deve
 * R$ 80,00" quando `Person.net` vem `-80.00`). Troca texto, não calcula: a string decimal segue a da API.
 */
export function withoutSign(money: Money): Money {
  return money.amount.startsWith('-') ? { ...money, amount: money.amount.slice(1) } : money;
}
