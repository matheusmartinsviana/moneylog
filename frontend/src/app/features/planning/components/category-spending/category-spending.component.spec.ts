import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { pt } from '~/app/common/i18n/translations/pt';
import { CategorySpendingComponent } from '~/app/features/planning/components/category-spending/category-spending.component';
import type { CategorySpendingState } from '~/modules/reports/core/facades/category-spending.facade';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aSpendingByCategory } from '~/testing/reports-testing';

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const CATEGORY = '8a3c6b10-5e2f-4d7a-9b41-c0d1e2f3a4b5';

async function setup(
  state: CategorySpendingState = { status: 'ready', data: aSpendingByCategory() },
) {
  const retry = vi.fn();
  const result = await render(CategorySpendingComponent, {
    providers: [provideI18nTesting('pt'), provideRouter([])],
    inputs: { state, month: '2026-10' },
    on: { retry },
  });
  return { ...result, retry };
}

describe('CategorySpendingComponent', () => {
  it('Dado o relatório, então mostra o total do backend e as categorias com valor e % do backend, mais "Outras"', async () => {
    await setup();

    expect(text(screen.getByTestId('home-categories-total'))).toContain('R$ 250,00');
    const list = screen.getByTestId('home-categories');
    const first = within(list).getByTestId(`home-categories-item-${CATEGORY}`);
    expect(text(first)).toContain('Tecnologia');
    expect(text(first)).toContain('R$ 200,00');
    expect(text(first)).toContain('80%');
    const other = within(list).getByTestId('home-categories-item-other');
    expect(text(other)).toContain('Outras (1 categoria)');
    expect(text(other)).toContain('R$ 50,00');
    expect(text(other)).toContain('20%');
  });

  it('Dado shares que não somam 100%, então mostra o que veio (o front não normaliza)', async () => {
    await setup({
      status: 'ready',
      data: aSpendingByCategory({
        items: [
          {
            category: { id: 'c1', name: 'A' },
            amount: { amount: '100.00', currency: 'BRL' },
            share: '0.3333',
          },
          {
            category: { id: 'c2', name: 'B' },
            amount: { amount: '100.00', currency: 'BRL' },
            share: '0.3333',
          },
          {
            category: { id: 'c3', name: 'C' },
            amount: { amount: '100.00', currency: 'BRL' },
            share: '0.3333',
          },
        ],
        other: null,
      }),
    });

    for (const id of ['c1', 'c2', 'c3']) {
      expect(text(screen.getByTestId(`home-categories-item-${id}`))).toContain('33,3%');
    }
  });

  it('Dado share nulo (base zero), então mostra só o valor, sem percentual', async () => {
    await setup({
      status: 'ready',
      data: aSpendingByCategory({
        items: [
          {
            category: { id: 'c1', name: 'A' },
            amount: { amount: '10.00', currency: 'BRL' },
            share: null,
          },
        ],
        other: null,
      }),
    });
    expect(text(screen.getByTestId('home-categories-item-c1'))).not.toContain('%');
  });

  it('Dado clique numa categoria, então o link leva a /transactions filtrado por categoria e competência', async () => {
    await setup();

    const link = screen.getByTestId(`home-categories-link-${CATEGORY}`);
    expect(link).toHaveAttribute('aria-label', 'Ver movimentações de Tecnologia');
    expect(link.getAttribute('href')).toBe(
      `/transactions?view=entries&competence=2026-10&categoryId=${CATEGORY}`,
    );
    expect(screen.queryByTestId('home-categories-link-other')).not.toBeInTheDocument();
  });

  it('Dado carregando, vazio e erro, então cada um tem o seu estado', async () => {
    const loading = await setup({ status: 'loading' });
    expect(screen.getByTestId('home-categories-loading')).toBeInTheDocument();
    loading.fixture.componentRef.setInput('state', {
      status: 'empty',
      data: aSpendingByCategory({ items: [], other: null }),
    });
    loading.fixture.detectChanges();
    expect(screen.getByTestId('home-categories-empty')).toHaveTextContent(
      pt.dashboard.categories.empty,
    );
    loading.fixture.componentRef.setInput('state', {
      status: 'error',
      problem: {
        status: 0,
        code: 'NETWORK',
        fieldErrors: [],
        traceId: null,
        retryAfterSeconds: null,
      },
    });
    loading.fixture.detectChanges();
    expect(screen.getByRole('alert')).toHaveTextContent(pt.dashboard.categories.error);

    await userEvent.click(screen.getByTestId('home-categories-retry'));
    expect(loading.retry).toHaveBeenCalledTimes(1);
  });

  it('Dado o cartão pronto, então não há violações de acessibilidade', async () => {
    const { container } = await setup();
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
