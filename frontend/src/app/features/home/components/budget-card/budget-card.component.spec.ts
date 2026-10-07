import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';

import { pt } from '~/app/common/i18n/translations/pt';
import { BudgetCardComponent } from '~/app/features/home/components/budget-card/budget-card.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

describe('BudgetCardComponent', () => {
  it('Dado D3 = "em breve", então o cartão diz isso, sem número, sem barra e sem botão, e leva a /budgets', async () => {
    const { container } = await render(BudgetCardComponent, {
      providers: [provideI18nTesting('pt'), provideRouter([])],
    });

    const card = screen.getByTestId('home-budget');
    expect(card).toHaveAttribute('aria-disabled', 'true');
    expect(card).toHaveTextContent(pt.dashboard.budget.description);
    expect(screen.getByRole('heading', { name: pt.dashboard.budget.title })).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/\d/);
    expect(container.querySelector('button, [role="progressbar"], svg')).toBeNull();
    expect(screen.getByTestId('home-budget-link')).toHaveAttribute('href', '/budgets');
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
