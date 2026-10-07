import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { DebtSummaryCardComponent } from '~/app/features/home/components/debt-summary-card/debt-summary-card.component';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  anEmptyDebtOverview,
  DebtOverviewGatewayStub,
  provideDebtOverviewStub,
} from '~/testing/debt-overview-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

vi.setConfig({ testTimeout: 30_000 });

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();

async function setup(gateway = new DebtOverviewGatewayStub()) {
  const result = await render(DebtSummaryCardComponent, {
    providers: [provideI18nTesting('pt'), provideRouter([]), provideDebtOverviewStub(gateway)],
  });
  await result.fixture.whenStable();
  return { ...result, gateway };
}

describe('DebtSummaryCardComponent', () => {
  it('Dado total maior que zero, então mostra o valor do servidor e o link para as dívidas totais', async () => {
    await setup();

    expect(text(screen.getByTestId('home-debts-total'))).toBe('R$ 6.500,00');
    expect(text(screen.getByTestId('home-debts-parts'))).toContain('R$ 5.000,00');
    expect(screen.getByTestId('home-debts-open')).toHaveAttribute('href', '/planning/debts');
  });

  it('Dado nada cadastrado, então convida a cadastrar, sem número', async () => {
    const gateway = new DebtOverviewGatewayStub();
    gateway.overview$ = of(anEmptyDebtOverview());
    await setup(gateway);

    expect(screen.getByTestId('home-debts-empty')).toHaveTextContent(pt.debtOverview.home.empty);
    expect(screen.queryByTestId('home-debts-total')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-debts-add')).toHaveAttribute('href', '/planning/debts');
  });

  it('Dado carregando, então mostra o status acessível', async () => {
    const gateway = new DebtOverviewGatewayStub();
    gateway.overview$ = NEVER;
    await setup(gateway);

    expect(screen.getByTestId('home-debts-loading')).toHaveAttribute('role', 'status');
  });

  it('Dado erro, então só o cartão degrada e "Tentar de novo" recarrega', async () => {
    const gateway = new DebtOverviewGatewayStub();
    gateway.overview$ = failWith(500, 'INTERNAL_ERROR');
    await setup(gateway);
    expect(screen.getByTestId('home-debts-error')).toHaveAttribute('role', 'alert');

    gateway.overview$ = null;
    await userEvent.click(screen.getByTestId('home-debts-retry'));

    expect(await screen.findByTestId('home-debts-total')).toBeInTheDocument();
  });

  it('Dado o cartão pronto, então não há violações de acessibilidade', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
