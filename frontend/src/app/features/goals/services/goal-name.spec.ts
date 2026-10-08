import { pt } from '~/app/common/i18n/translations/pt';
import { goalName } from '~/app/features/goals/services/goal-name';
import { aGoal, aMetricGoal } from '~/testing/goals-testing';

describe('goalName', () => {
  it('Dado uma meta com nome, então mostra o nome', () => {
    expect(goalName(aGoal(), pt.goals)).toBe('Reserva de emergência');
  });

  it('Dado meta de medida sem nome, então gera o rótulo com a medida e o alvo na moeda do dado', () => {
    const label = goalName(aMetricGoal(), pt.goals);

    expect(label).toMatch(/^Total de dívidas até R\$\s4\.000,00$/);
  });

  it('Dado meta de medida sem medida conhecida, então usa o rótulo genérico', () => {
    const label = goalName(aMetricGoal({ metric: null }), pt.goals);

    expect(label).toContain(pt.goals.metricFallback);
  });
});
