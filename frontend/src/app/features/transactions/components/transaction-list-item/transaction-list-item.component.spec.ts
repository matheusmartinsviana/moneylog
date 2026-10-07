import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { TransactionListItemComponent } from '~/app/features/transactions/components/transaction-list-item/transaction-list-item.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aTransaction } from '~/testing/transactions-testing';

async function setup(inputs: Record<string, unknown> = {}) {
  const open = vi.fn();
  const result = await render(
    `<ul><li app-transaction-list-item [transaction]="transaction" [glyph]="glyph" [dateLabel]="dateLabel" (open)="open($event)"></li></ul>`,
    {
      imports: [TransactionListItemComponent],
      providers: [provideI18nTesting('pt')],
      componentProperties: {
        transaction: aTransaction(),
        glyph: false,
        dateLabel: null,
        open,
        ...inputs,
      },
    },
  );
  return { ...result, open };
}

describe('TransactionListItemComponent', () => {
  it('Dado a lista de movimentações, então segue sem glifo e com a data completa', async () => {
    await setup();

    const row = screen.getByTestId('transaction-item-tx-1');
    expect(row).not.toHaveClass('is-workspace');
    expect(screen.queryByTestId('item-glyph')).not.toBeInTheDocument();
    expect(row.textContent).toContain('4 de out.');
  });

  it('Dado a variante do Início, então mostra o glifo com a inicial da categoria e o rótulo de data recebido', async () => {
    await setup({ glyph: true, dateLabel: 'Hoje' });

    const row = screen.getByTestId('transaction-item-tx-1');
    expect(row).toHaveClass('is-workspace');
    expect(row.querySelector('[data-cy="item-glyph"]')).toHaveTextContent('A');
    expect(row.querySelector('[data-cy="item-glyph"]')).toHaveAttribute('aria-hidden', 'true');
    expect(row.textContent).toContain('Hoje');
    expect(row.textContent).not.toContain('4 de out.');
  });

  it('Dado sem categoria, então o glifo usa a inicial da descrição', async () => {
    await setup({
      glyph: true,
      transaction: aTransaction({ category: null, description: 'cinema' }),
    });

    expect(screen.getByTestId('item-glyph')).toHaveTextContent('C');
  });

  it('Dado clique ou Enter, então emite a movimentação para abrir', async () => {
    const { open } = await setup({ glyph: true });

    await userEvent.click(screen.getByTestId('transaction-item-tx-1'));
    screen.getByTestId('transaction-item-tx-1').focus();
    await userEvent.keyboard('{Enter}');

    expect(open).toHaveBeenCalledTimes(2);
  });

  it('Dado a linha, então não há violações de acessibilidade', async () => {
    const { container } = await setup({ glyph: true });
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
