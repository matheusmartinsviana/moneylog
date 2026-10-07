import { render, screen } from '@testing-library/angular';

import { pt } from '~/app/common/i18n/translations/pt';
import { BudgetsPage } from '~/app/features/budgets/pages/budgets.page';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

describe('BudgetsPage', () => {
  it('Dado D3 = "em breve", então a página diz que os orçamentos chegam em breve, sem ação que finja', async () => {
    const { container } = await render(BudgetsPage, { providers: [provideI18nTesting('pt')] });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(pt.nav.budgets);
    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.emptyState.budgets.title);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
