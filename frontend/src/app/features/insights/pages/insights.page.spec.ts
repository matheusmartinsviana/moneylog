import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { InsightsPage } from '~/app/features/insights/pages/insights.page';
import { AiGatewayStub, aiProblem, anInsight, provideAiStub } from '~/testing/ai-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup(gateway: AiGatewayStub) {
  return render(InsightsPage, {
    providers: [provideI18nTesting('pt'), provideRouter([]), provideAiStub(gateway)],
  });
}

describe('InsightsPage', () => {
  it('Dado insights do backend, então lista as frases com a origem e o link para o gasto', async () => {
    const gateway = new AiGatewayStub();
    gateway.insightsResult = () => of({ items: [anInsight()], hasNext: false });
    const { container } = await setup(gateway);

    expect(await screen.findByTestId('insights-list')).toHaveTextContent('Alimentação subiu 33,3%');
    expect(screen.getByTestId('insights-list')).toHaveTextContent(pt.ai.insights.source);
    expect(screen.getByTestId('insight-spending-link')).toHaveAttribute(
      'href',
      '/transactions?categoryId=cat-1',
    );
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado nenhum insight, então mostra o vazio sem esconder a tela', async () => {
    await setup(new AiGatewayStub());
    expect(await screen.findByText(pt.ai.insights.empty)).toBeInTheDocument();
  });

  it('Dado erro, então oferece tentar de novo', async () => {
    const gateway = new AiGatewayStub();
    gateway.insightsResult = () => aiProblem('INTERNAL_ERROR', 500);
    await setup(gateway);
    expect(await screen.findByRole('button', { name: pt.errors.load.retry })).toBeInTheDocument();
  });
});
