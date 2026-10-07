import type { AppI18n } from '~/app/common/i18n/i18n';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { Insight } from '~/modules/ai/core/types/ai';
import { formatMoney } from '~/util/money';

/** O backend manda decimais sem moeda; os dados do MVP são todos em BRL (a moeda é a do dado). */
const DATA_CURRENCY = 'BRL';
const PERCENT_POINTS = /^-?\d+(?:\.\d+)?$/;

const formatters = new Map<string, Intl.NumberFormat>();

/** `deltaPercent` já vem em pontos percentuais (`23.4`): só formata, sem sinal (o verbo diz subiu/caiu). */
function formatPercentPoints(value: string, locale: string): string {
  if (!PERCENT_POINTS.test(value)) return value;
  let formatter = formatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    formatters.set(locale, formatter);
  }
  const unsigned = value.startsWith('-') ? value.slice(1) : value;
  return `${formatter.format(unsigned as Intl.StringNumericLiteral)}%`;
}

const money = (amount: string | undefined) =>
  formatMoney({ amount: amount ?? '0', currency: DATA_CURRENCY });

/**
 * Traduz um insight pela `key` do contrato (o backend não monta frase). Chave desconhecida ou parâmetro
 * ausente devolve `null`: o front não inventa texto nem mostra a chave crua.
 */
export function insightText(
  insight: Insight,
  copy: AppI18n['ai']['insights'],
  locale: string,
): string | null {
  const p = insight.params;
  switch (insight.key) {
    case 'insight.category.up':
    case 'insight.category.down': {
      if (p['categoryName'] === undefined || p['deltaPercent'] === undefined) return null;
      return interpolate(
        insight.key === 'insight.category.up' ? copy.categoryUp : copy.categoryDown,
        {
          category: p['categoryName'],
          percent: formatPercentPoints(p['deltaPercent'], locale),
          previous: money(p['previous']),
          current: money(p['current']),
        },
      );
    }
    case 'insight.card.committed':
      if (p['amount'] === undefined) return null;
      return interpolate(copy.cardCommitted, { amount: money(p['amount']) });
    default:
      return null;
  }
}

export interface InsightLine {
  readonly id: string;
  readonly text: string;
  readonly categoryId: string | null;
}

/** Só os insights que sabemos traduzir; o `id` é estável para o `@for`. */
export function insightLines(
  insights: readonly Insight[],
  copy: AppI18n['ai']['insights'],
  locale: string,
): InsightLine[] {
  const lines: InsightLine[] = [];
  insights.forEach((insight, index) => {
    const text = insightText(insight, copy, locale);
    if (text !== null)
      lines.push({
        id: `${insight.key}-${index}`,
        text,
        categoryId: insight.params['categoryId'] ?? null,
      });
  });
  return lines;
}
