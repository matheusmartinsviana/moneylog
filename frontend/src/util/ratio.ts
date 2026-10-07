/**
 * Razão decimal do backend (`Ratio`, 4 casas: `0.4250` = 42,5%). O front só **formata**: a string vai direto
 * para o `Intl.NumberFormat` (sem `Number()` e sem multiplicar), então não há conta nem arredondamento
 * financeiro aqui (arquitetura §1).
 */
const RATIO = /^-?\d+(?:\.\d+)?$/;

export interface RatioFormatOptions {
  /** Mostra `+`/`−` (comparações com o mês anterior); zero fica sem sinal. */
  readonly signed?: boolean;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(locale: string, signed: boolean): Intl.NumberFormat {
  const key = `${locale}:${signed}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
      signDisplay: signed ? 'exceptZero' : 'auto',
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/** `0.4250` → `42,5%` (locale do idioma da UI). Valor fora do formato volta como veio. */
export function formatRatio(
  ratio: string,
  locale: string,
  options: RatioFormatOptions = {},
): string {
  if (!RATIO.test(ratio)) return ratio;
  return formatterFor(locale, options.signed === true)
    .formatToParts(ratio as Intl.StringNumericLiteral)
    .map((part) => (part.type === 'minusSign' ? '−' : part.value))
    .join('');
}

/**
 * A razão como `number`, **só para desenhar** a barra de progresso (largura de 0 a 100%): nenhuma conta
 * financeira usa esse número. `null` quando a string não é uma razão.
 */
export function ratioForBar(ratio: string): number | null {
  if (!RATIO.test(ratio)) return null;
  const value = Number(ratio);
  return Number.isFinite(value) ? value : null;
}

/** O sinal da razão: só lê o texto (para destacar "subiu" e "caiu" sem calcular). */
export function ratioSign(ratio: string): 'up' | 'down' | 'flat' {
  if (!RATIO.test(ratio)) return 'flat';
  if (ratio.startsWith('-')) return /[1-9]/.test(ratio) ? 'down' : 'flat';
  return /[1-9]/.test(ratio) ? 'up' : 'flat';
}

/**
 * A razão sem o sinal (`-0.0420` → `0.0420`): só texto, para frases como "4,2% menor que o mês anterior" em que o
 * sentido já está na própria frase. Valor fora do formato volta como veio.
 */
export function ratioMagnitude(ratio: string): string {
  return RATIO.test(ratio) ? ratio.replace(/^-/, '') : ratio;
}

/**
 * Diferença **em pontos percentuais** (`-0.0333` → `−3,3`): o mesmo formato de `formatRatio`, sem o símbolo `%`
 * (o rótulo "p.p." vem da frase traduzida). Nenhuma conta: a string vai direto para o `Intl.NumberFormat`.
 */
export function formatPoints(
  ratio: string,
  locale: string,
  options: RatioFormatOptions = {},
): string {
  if (!RATIO.test(ratio)) return ratio;
  return formatterFor(locale, options.signed === true)
    .formatToParts(ratio as Intl.StringNumericLiteral)
    .filter((part) => part.type !== 'percentSign')
    .map((part) => (part.type === 'minusSign' ? '−' : part.value))
    .join('')
    .trim();
}
