import { interpolate } from '~/app/common/i18n/interpolate';
import { formatCompetence, formatIsoDate } from '~/util/date';

/**
 * Rótulo "Renda de <mês> (recebida em <data>)" (ADR-017): só quando a competência da renda que o backend
 * devolveu difere do mês da data. Sem competência declarada (ou igual ao mês da data), não há rótulo.
 * Não calcula nada: compara dois textos `YYYY-MM` e formata.
 */
export function incomeMonthNote(
  tx: { readonly date: string; readonly incomeCompetence: string | null },
  template: string,
  locale: string,
): string | null {
  const competence = tx.incomeCompetence;
  if (!competence || competence === tx.date.slice(0, 7)) return null;
  return interpolate(template, {
    month: formatCompetence(competence, locale),
    date: formatIsoDate(tx.date, locale),
  });
}
