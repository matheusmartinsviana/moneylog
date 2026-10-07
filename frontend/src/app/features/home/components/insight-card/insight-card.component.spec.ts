import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { pt } from '~/app/common/i18n/translations/pt';
import {
  hasInsight,
  InsightCardComponent,
} from '~/app/features/home/components/insight-card/insight-card.component';
import { anInsight } from '~/testing/ai-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').replace(/\s+/g, ' ').trim();

async function setup(aiEnabled = false, askAi = vi.fn()) {
  const view = await render(InsightCardComponent, {
    providers: [provideI18nTesting('pt'), provideRouter([])],
    inputs: { insights: [anInsight()], aiEnabled },
    on: { askAi },
  });
  return { ...view, askAi };
}

describe('InsightCardComponent', () => {
  it('Dado um insight do backend, então a frase vem da key, rotulada "Insight" e como calculada (não "IA")', async () => {
    await setup();

    expect(text(screen.getByTestId('home-insight-text'))).toBe(
      'Alimentação subiu 33,3% em relação ao mês passado (R$ 450,00 para R$ 600,00).',
    );
    expect(screen.getByRole('heading', { name: pt.dashboard.insight.title })).toBeInTheDocument();
    expect(screen.getByText(pt.ai.insights.source)).toBeInTheDocument();
  });

  it('Dado "Ver todos", então leva a /insights', async () => {
    await setup();
    expect(screen.getByTestId('home-insight-analysis')).toHaveAttribute('href', '/insights');
  });

  it('Dado a IA desligada, então "Perguntar à IA" é desabilitado e não pede nada', async () => {
    const { askAi } = await setup(false);
    const ask = screen.getByTestId('home-insight-ask-ai');

    expect(ask).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(ask);

    expect(askAi).not.toHaveBeenCalled();
  });

  it('Dado a IA ligada, então "Perguntar à IA" pede o consentimento', async () => {
    const { askAi } = await setup(true);
    const ask = screen.getByTestId('home-insight-ask-ai');

    expect(ask).not.toHaveAttribute('aria-disabled');
    await userEvent.click(ask);

    expect(askAi).toHaveBeenCalledTimes(1);
  });

  describe('hasInsight', () => {
    it('Dado nenhum insight, então o cartão não aparece', () => {
      expect(hasInsight([])).toBe(false);
      expect(hasInsight([anInsight()])).toBe(true);
    });
  });

  it('Dado o insight, então não há violações de acessibilidade', async () => {
    const { container } = await setup();
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
