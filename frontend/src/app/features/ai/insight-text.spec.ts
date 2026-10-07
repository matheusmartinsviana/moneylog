import { pt } from '~/app/common/i18n/translations/pt';
import { insightLines, insightText } from '~/app/features/ai/insight-text';
import { anInsight } from '~/testing/ai-testing';

const text = (value: string | null) => value?.replace(/\s+/g, ' ');

describe('insightText', () => {
  it('Dado alta de categoria, então traduz pela key com a variação do backend e a moeda do dado', () => {
    expect(text(insightText(anInsight(), pt.ai.insights, 'pt-BR'))).toBe(
      'Alimentação subiu 33,3% em relação ao mês passado (R$ 450,00 para R$ 600,00).',
    );
  });

  it('Dado queda com percentual negativo, então mostra o módulo e o verbo "caiu"', () => {
    const insight = anInsight({
      key: 'insight.category.down',
      params: {
        ...anInsight().params,
        deltaPercent: '-20.0',
        current: '400.00',
        previous: '500.00',
      },
    });
    expect(text(insightText(insight, pt.ai.insights, 'pt-BR'))).toContain('caiu 20%');
  });

  it('Dado comprometido no cartão, então mostra o valor', () => {
    const insight = anInsight({
      type: 'CARD_COMMITTED',
      key: 'insight.card.committed',
      params: { amount: '1500.00' },
    });
    expect(text(insightText(insight, pt.ai.insights, 'pt-BR'))).toBe(
      'Você tem R$ 1.500,00 comprometidos nos cartões.',
    );
  });

  it('Dado key desconhecida ou parâmetro ausente, então não mostra nada (nunca a chave crua)', () => {
    expect(insightText(anInsight({ key: 'insight.nova' }), pt.ai.insights, 'pt-BR')).toBeNull();
    expect(insightLines([anInsight({ params: {} })], pt.ai.insights, 'pt-BR')).toEqual([]);
  });
});
