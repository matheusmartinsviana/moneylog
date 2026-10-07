import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { pt } from '~/app/common/i18n/translations/pt';
import { RecentTransactionsComponent } from '~/app/features/home/components/recent-transactions/recent-transactions.component';
import type { RecentTransactionsState } from '~/modules/transactions/core/facades/recent-transactions.facade';
import { brl } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aTransaction } from '~/testing/transactions-testing';

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const items = () => [
  aTransaction({ id: 'tx-hoje', description: 'Almoço', date: '2026-10-10' }),
  aTransaction({
    id: 'tx-ontem',
    description: 'Salário',
    date: '2026-10-09',
    type: 'INCOME',
    amount: brl('3000.00'),
    impact: {
      cash: brl('3000.00'),
      consumption: [],
      netWorth: brl('3000.00'),
      commitment: brl('0.00'),
    },
  }),
  aTransaction({ id: 'tx-antes', description: 'Cinema', date: '2026-10-04', category: null }),
];

async function setup(state: RecentTransactionsState = { status: 'ready', data: items() }) {
  const retry = vi.fn();
  const result = await render(RecentTransactionsComponent, {
    providers: [provideI18nTesting('pt'), provideRouter([])],
    inputs: { state, asOf: '2026-10-10' },
    on: { retry },
  });
  return { ...result, retry };
}

describe('RecentTransactionsComponent', () => {
  it('Dado as movimentações, então lista limpa com glifo da categoria, "Hoje", "Ontem" e a data', async () => {
    await setup();

    const rows = screen.getAllByTestId(/^transaction-item-/);
    expect(rows).toHaveLength(3);
    expect(text(rows[0]!)).toContain('Almoço');
    expect(text(rows[0]!)).toContain('Alimentação · Nubank · Hoje');
    expect(text(rows[1]!)).toContain('Ontem');
    // O dia relativo compara com o `asOf` do backend; outro dia mostra a data.
    expect(text(rows[2]!)).toContain('4 de out.');
    expect(text(rows[2]!)).toContain(pt.transactions.noCategory);
    // Glifo neutro com a inicial da categoria (nada de logotipo de comerciante).
    expect(rows[0]!.querySelector('[data-cy="item-glyph"]')).toHaveTextContent('A');
    expect(rows[0]!).toHaveClass('row-hover');
  });

  it('Dado receita e despesa, então o valor leva o sinal e a cor só vem da direção do backend', async () => {
    await setup();

    const rows = screen.getAllByTestId(/^transaction-item-/);
    expect(text(rows[0]!)).toContain('−R$ 35,00');
    expect(text(rows[1]!)).toContain('+R$ 3.000,00');
    expect(rows[1]!.querySelector('.item__amount')).toHaveClass('is-in');
    expect(rows[0]!.querySelector('.item__amount')).not.toHaveClass('is-in');
  });

  it('Dado clique na linha, então abre a movimentação; "Ver todas" leva a /transactions', async () => {
    await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await userEvent.click(screen.getByTestId('transaction-item-tx-hoje'));

    expect(navigate).toHaveBeenCalledWith(['/transactions', 'tx-hoje']);
    expect(screen.getByTestId('home-recent-all')).toHaveAttribute('href', '/transactions');
  });

  it('Dado carregando, vazio e erro, então cada estado aparece (erro com "tentar de novo")', async () => {
    const view = await setup({ status: 'loading' });
    expect(screen.getByTestId('home-recent-loading')).toBeInTheDocument();
    view.fixture.componentRef.setInput('state', { status: 'empty' });
    view.fixture.detectChanges();
    expect(screen.getByTestId('home-recent-empty')).toHaveTextContent(pt.dashboard.recent.empty);
    view.fixture.componentRef.setInput('state', {
      status: 'error',
      problem: { status: 500, code: 'X', fieldErrors: [], traceId: null, retryAfterSeconds: null },
    });
    view.fixture.detectChanges();
    expect(screen.getByRole('alert')).toHaveTextContent(pt.dashboard.recent.error);

    await userEvent.click(screen.getByTestId('home-recent-retry'));

    expect(view.retry).toHaveBeenCalledTimes(1);
  });

  it('Dado a lista, então não há violações de acessibilidade', async () => {
    const { container } = await setup();
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
