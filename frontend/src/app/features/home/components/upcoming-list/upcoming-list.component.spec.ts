import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { pt } from '~/app/common/i18n/translations/pt';
import { UpcomingListComponent } from '~/app/features/home/components/upcoming-list/upcoming-list.component';
import type { Upcoming } from '~/modules/dashboard/core/types/upcoming';
import { brl } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

/** O cenário de T81: cobrança do João, internet, dívida atrasada e dívida sem data. */
const scenario = (): Upcoming => ({
  items: [
    {
      kind: 'DEBT_PAYABLE',
      bucket: 'OVERDUE',
      dueDate: '2026-10-01',
      direction: 'OUT',
      amount: brl('80.00'),
      label: 'Maria',
      refType: 'DEBT',
      refId: 'debt-2',
      items: [],
    },
    {
      kind: 'DEBT_RECEIVABLE',
      bucket: 'TODAY',
      dueDate: '2026-10-05',
      direction: 'IN',
      amount: brl('150.00'),
      label: 'João',
      refType: 'DEBT',
      refId: 'debt-1',
      items: [],
    },
    {
      kind: 'RECURRENCE',
      bucket: 'NEXT_7_DAYS',
      dueDate: '2026-10-10',
      direction: 'OUT',
      amount: brl('119.00'),
      label: 'Internet',
      refType: 'RECURRENCE',
      refId: 'rec-1',
      items: [],
    },
    {
      kind: 'RECURRENCE',
      bucket: 'NEXT_30_DAYS',
      dueDate: '2026-10-25',
      direction: 'IN',
      amount: brl('5000.00'),
      label: 'Salário',
      refType: 'RECURRENCE',
      refId: 'rec-2',
      items: [],
    },
  ],
  undated: [
    {
      kind: 'DEBT_RECEIVABLE',
      bucket: null,
      dueDate: null,
      direction: 'IN',
      amount: brl('40.00'),
      label: 'Pedro',
      refType: 'DEBT',
      refId: 'debt-3',
      items: [],
    },
  ],
  totals: { out: brl('199.00'), in: brl('5190.00') },
  overdueTruncated: false,
});

async function setup(upcoming = scenario()) {
  const realize = vi.fn();
  const result = await render(UpcomingListComponent, {
    inputs: { upcoming },
    on: { realize },
    providers: [provideI18nTesting('pt'), provideRouter([])],
  });
  return { ...result, realize };
}

describe('UpcomingListComponent (dívidas e recorrências, T89)', () => {
  it('Dado o /upcoming, então agrupa pelo bucket do backend: atrasados, hoje, 7 dias, 30 dias e, por último, sem data', async () => {
    await setup();

    const order = Array.from(document.querySelectorAll('[data-cy^="home-upcoming-group-"]')).map(
      (el) => el.getAttribute('data-cy'),
    );
    expect(order).toEqual([
      'home-upcoming-group-OVERDUE',
      'home-upcoming-group-TODAY',
      'home-upcoming-group-NEXT_7_DAYS',
      'home-upcoming-group-NEXT_30_DAYS',
      'home-upcoming-group-UNDATED',
    ]);
  });

  it('Dado dívida atrasada, então está em "Vencidos" (texto) com o valor e a dívida como link', async () => {
    await setup();

    const group = screen.getByTestId('home-upcoming-group-OVERDUE');
    expect(group).toHaveTextContent(pt.home.upcoming.buckets.OVERDUE);
    expect(within(group).getByTestId('home-upcoming-debt-link')).toHaveAttribute(
      'href',
      '/debts/debt-2',
    );
    expect(text(within(group).getByTestId('home-upcoming-amount'))).toBe('R$ 80,00');
    expect(text(within(group).getByTestId('home-upcoming-kind'))).toBe('Você deve');
  });

  it('Dado cobrança (entrada), então aparece como "A receber" e o total a receber é o do backend, separado do a pagar', async () => {
    await setup();

    const today = screen.getByTestId('home-upcoming-group-TODAY');
    expect(text(within(today).getByTestId('home-upcoming-kind'))).toBe('A receber');
    expect(text(screen.getByTestId('home-upcoming-total-out'))).toBe('R$ 199,00');
    expect(text(screen.getByTestId('home-upcoming-total-in'))).toBe('R$ 5.190,00');
    expect(screen.getByTestId('home-upcoming-in-note')).toHaveTextContent(
      pt.home.upcoming.totalInNote,
    );
  });

  it('Dado movimentação futura agendada, então aparece uma vez, rotulada, com link para o detalhe', async () => {
    const base = scenario();
    await setup({
      ...base,
      items: [
        ...base.items,
        {
          kind: 'SCHEDULED_TRANSACTION',
          bucket: 'NEXT_7_DAYS',
          dueDate: '2026-10-09',
          direction: 'OUT',
          amount: brl('120.00'),
          label: 'Presente',
          refType: 'TRANSACTION',
          refId: 'tx-9',
          items: [],
        },
      ],
    });

    const items = screen
      .getAllByTestId('home-upcoming-item')
      .filter((el) => el.getAttribute('data-kind') === 'SCHEDULED_TRANSACTION');
    expect(items).toHaveLength(1);
    expect(text(within(items[0]!).getByTestId('home-upcoming-kind'))).toBe(
      pt.home.upcoming.kinds.SCHEDULED_TRANSACTION,
    );
    expect(within(items[0]!).getByTestId('home-upcoming-transaction-link')).toHaveAttribute(
      'href',
      '/transactions/tx-9',
    );
    expect(within(items[0]!).queryByTestId('home-upcoming-realize')).not.toBeInTheDocument();
  });

  it('Dado dívida sem data, então está em "Sem data prevista" com link para a dívida', async () => {
    await setup();

    const group = screen.getByTestId('home-upcoming-group-UNDATED');
    expect(group).toHaveTextContent(pt.home.upcoming.undated);
    expect(within(group).getByTestId('home-upcoming-debt-link')).toHaveAttribute(
      'href',
      '/debts/debt-3',
    );
  });

  it('Dado ocorrência de recorrência, então tem a ação "Realizar" (e a dívida não)', async () => {
    const { realize } = await setup();

    const buttons = screen.getAllByTestId('home-upcoming-realize');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName('Realizar Internet');
    await userEvent.click(buttons[0]!);

    expect(realize).toHaveBeenCalledTimes(1);
    expect(realize.mock.calls[0]![0]).toMatchObject({ refId: 'rec-1', dueDate: '2026-10-10' });
    expect(
      within(screen.getByTestId('home-upcoming-group-TODAY')).queryByTestId(
        'home-upcoming-realize',
      ),
    ).not.toBeInTheDocument();
  });

  it('Dado receita recorrente, então diz "Entrada" além de "Recorrência"', async () => {
    await setup();

    const group = screen.getByTestId('home-upcoming-group-NEXT_30_DAYS');
    expect(group).toHaveTextContent('Recorrência');
    expect(within(group).getByTestId('home-upcoming-incoming')).toHaveTextContent(
      pt.home.upcoming.incoming,
    );
  });

  it('Dado recorrências, então oferece o caminho para as pendentes', async () => {
    await setup();

    expect(screen.getByTestId('home-upcoming-pending')).toHaveAttribute(
      'href',
      '/planning/occurrences',
    );
  });

  it('Dado só dívidas, então não oferece "Realizar" nem o caminho das pendentes', async () => {
    const upcoming = scenario();
    await setup({
      ...upcoming,
      items: upcoming.items.filter((item) => item.refType === 'DEBT'),
    });

    expect(screen.queryByTestId('home-upcoming-realize')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-upcoming-pending')).not.toBeInTheDocument();
  });

  it('Dado nada, então mostra o vazio', async () => {
    await setup({
      items: [],
      undated: [],
      totals: { out: brl('0.00'), in: brl('0.00') },
      overdueTruncated: false,
    });

    expect(screen.getByTestId('home-upcoming-empty')).toBeInTheDocument();
  });

  it('Dado a lista, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
