import type { AppI18n } from '~/app/common/i18n/i18n';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { IntervalUnit } from '~/modules/recurrences/core/types/recurrence';

/** "Todo mês" / "A cada 2 semanas": a frequência da recorrência em texto. */
export function frequencyText(
  recurrence: {
    readonly frequency: string;
    readonly interval: number;
    readonly unit: IntervalUnit | null;
  },
  copy: AppI18n['recurrences'],
): string {
  if (recurrence.frequency === 'CUSTOM' && recurrence.unit !== null) {
    return interpolate(copy.every, {
      interval: String(recurrence.interval),
      unit: copy.units[recurrence.unit].toLocaleLowerCase(),
    });
  }
  return copy.frequency[recurrence.frequency as keyof AppI18n['recurrences']['frequency']];
}
