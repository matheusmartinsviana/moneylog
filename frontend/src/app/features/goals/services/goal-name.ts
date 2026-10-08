import type { AppI18n } from '~/app/common/i18n/i18n';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { Goal } from '~/modules/goals/core/types/goal';
import { formatMoney } from '~/util/money';

/**
 * Nome a exibir: o que o usuário deu à meta ou, em `METRIC` sem nome, o rótulo gerado pela medida
 * ("Total de dívidas até R$ 4.000,00"). Só formata o que o servidor devolveu.
 */
export function goalName(
  goal: Pick<Goal, 'name' | 'metric' | 'target'>,
  copy: AppI18n['goals'],
): string {
  if (goal.name !== null && goal.name !== '') return goal.name;
  const metric = goal.metric === null ? copy.metricFallback : copy.metric[goal.metric];
  return interpolate(copy.generatedName, { metric, target: formatMoney(goal.target) });
}
