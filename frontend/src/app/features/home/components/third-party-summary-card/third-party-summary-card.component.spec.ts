import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';

import { ThirdPartySummaryCardComponent } from '~/app/features/home/components/third-party-summary-card/third-party-summary-card.component';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  aReceivables,
  anEmptyReceivables,
  provideThirdPartiesStub,
  ThirdPartiesGatewayStub,
} from '~/testing/third-parties-testing';

async function setup(gateway: ThirdPartiesGatewayStub) {
  const result = await render(ThirdPartySummaryCardComponent, {
    providers: [provideI18nTesting('pt'), provideRouter([]), provideThirdPartiesStub(gateway)],
  });
  await result.fixture.whenStable();
}

describe('ThirdPartySummaryCardComponent', () => {
  it('Dado valores a receber, então mostra o pendente do servidor e o link para a tela', async () => {
    await setup(new ThirdPartiesGatewayStub());

    expect(screen.getByTestId('home-third-parties-pending')).toHaveTextContent('R$ 700,00');
    expect(screen.getByTestId('home-third-parties-open')).toHaveAttribute(
      'href',
      '/planning/third-parties',
    );
  });

  it('Dado tudo zero, então o cartão some', async () => {
    const gateway = new ThirdPartiesGatewayStub();
    gateway.receivables$ = of(anEmptyReceivables());
    await setup(gateway);

    expect(screen.queryByTestId('home-third-parties-pending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-third-parties-open')).not.toBeInTheDocument();
  });

  it('Dado só recebido, então ainda aparece (o servidor devolveu posição)', async () => {
    const gateway = new ThirdPartiesGatewayStub();
    gateway.receivables$ = of(
      aReceivables({
        owed: { amount: '0.00', currency: 'BRL' },
        pending: { amount: '0.00', currency: 'BRL' },
      }),
    );
    await setup(gateway);

    expect(screen.getByTestId('home-third-parties-open')).toBeInTheDocument();
  });
});
