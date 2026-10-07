import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { en } from '~/app/common/i18n/translations/en';
import { pt } from '~/app/common/i18n/translations/pt';
import {
  KpiCardsComponent,
  type KpiMonthlyStatus,
} from '~/app/features/home/components/kpi-cards/kpi-cards.component';
import type { DashboardSummary } from '~/modules/dashboard/core/types/dashboard-summary';
import type { MonthlySummary } from '~/modules/monthly-summary/core/types/monthly-summary';
import { brl } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aDashboardSummary } from '~/testing/dashboard-testing';
import { aSummary } from '~/testing/etapa5-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Mês encerrado: as comparações com o anterior são tendência de verdade. */
const closedMonth = (overrides: Partial<MonthlySummary> = {}): MonthlySummary =>
  aSummary({
    partial: false,
    savingsRate: '0.4120',
    comparison: {
      previousMonth: {
        competence: '2026-09',
        income: brl('10000.00'),
        expenses: brl('6000.00'),
        investments: brl('0.00'),
        net: brl('4000.00'),
        savingsRate: '0.3740',
      },
      incomeDelta: { amount: brl('1000.00'), percent: '0.1000' },
      expensesDelta: { amount: brl('-250.00'), percent: '-0.0420' },
      investmentsDelta: { amount: brl('0.00'), percent: null },
      netDelta: { amount: brl('1250.00'), percent: '0.3125' },
      savingsRateDelta: '0.0380',
    },
    ...overrides,
  });

async function setup(
  options: {
    summary?: DashboardSummary;
    monthly?: MonthlySummary | null;
    status?: KpiMonthlyStatus;
    language?: 'pt' | 'en';
  } = {},
) {
  const retry = vi.fn();
  const result = await render(KpiCardsComponent, {
    providers: [provideI18nTesting(options.language ?? 'pt')],
    inputs: {
      summary: options.summary ?? aDashboardSummary(),
      monthly: options.monthly === undefined ? closedMonth() : options.monthly,
      monthlyStatus: options.status ?? 'ready',
    },
    on: { retry },
  });
  return { ...result, retry };
}

describe('KpiCardsComponent', () => {
  it('Dado o resumo, então são 4 seções com rótulo e valores exatamente como o backend mandou', async () => {
    await setup();

    const group = screen.getByRole('group', { name: pt.dashboard.kpis.label });
    expect(within(group).getAllByRole('region')).toHaveLength(4);
    expect(text(screen.getByTestId('kpi-in-accounts-value'))).toBe('R$ 18.900,00');
    expect(text(screen.getByTestId('kpi-spending-value'))).toBe('R$ 1.620,50');
    expect(text(screen.getByTestId('kpi-income-value'))).toBe('R$ 12.000,00');
    expect(text(screen.getByTestId('kpi-savings-value'))).toBe('41,2%');
  });

  it('Dado inAccountsChange do backend, então o chip mostra o percentual dele e o rótulo "vs fim do mês passado"', async () => {
    await setup();
    expect(text(screen.getByTestId('kpi-in-accounts-change'))).toBe('+8% vs fim do mês passado');
    expect(screen.getByTestId('kpi-in-accounts-change')).toHaveAttribute('data-tone', 'positive');
  });

  it('Dado inAccountsChange ausente (projeção ou sem contas), então não há chip', async () => {
    const base = aDashboardSummary();
    await setup({
      summary: aDashboardSummary({ balances: { ...base.balances, inAccountsChange: null } }),
    });
    expect(screen.queryByTestId('kpi-in-accounts-change')).not.toBeInTheDocument();
  });

  it('Dado percent nulo em inAccountsChange, então diz "sem base de comparação" em tom neutro', async () => {
    const base = aDashboardSummary();
    await setup({
      summary: aDashboardSummary({
        balances: {
          ...base.balances,
          inAccountsChange: {
            previous: brl('0.00'),
            amount: brl('500.00'),
            percent: null,
            since: '2026-09-30',
          },
        },
      }),
    });
    expect(text(screen.getByTestId('kpi-in-accounts-change'))).toBe(pt.dashboard.kpis.delta.noBase);
    expect(screen.getByTestId('kpi-in-accounts-change')).toHaveAttribute('data-tone', 'neutral');
  });

  it('Dado saldo negativo em contas, então o valor leva o menos tipográfico e o tom de risco', async () => {
    const base = aDashboardSummary();
    await setup({
      summary: aDashboardSummary({ balances: { ...base.balances, inAccounts: brl('-120.00') } }),
    });
    const value = screen.getByTestId('kpi-in-accounts-value');
    expect(text(value)).toBe('−R$ 120,00');
    expect(value).toHaveClass('is-negative');
  });

  describe('mês encerrado: a variação é tendência', () => {
    it('Dado expensesDelta -0.0420, então "4,2% menor que o mês anterior" em tom positivo (gastar menos é bom)', async () => {
      await setup();
      expect(text(screen.getByTestId('kpi-spending-change'))).toBe('4,2% menor que o mês anterior');
      expect(screen.getByTestId('kpi-spending-change')).toHaveAttribute('data-tone', 'positive');
    });

    it('Dado gasto maior, então "maior" em tom de atenção (nunca vermelho) e a frase diz o sentido', async () => {
      const month = closedMonth();
      await setup({
        monthly: {
          ...month,
          comparison: {
            ...month.comparison,
            expensesDelta: { amount: brl('100.00'), percent: '0.1800' },
          },
        },
      });
      expect(text(screen.getByTestId('kpi-spending-change'))).toBe('18% maior que o mês anterior');
      expect(screen.getByTestId('kpi-spending-change')).toHaveAttribute('data-tone', 'warning');
    });

    it('Dado percent nulo, então "sem base de comparação"; dado 0.0000, então "igual ao mês anterior"', async () => {
      const month = closedMonth();
      const { rerender } = await setup({
        monthly: {
          ...month,
          comparison: {
            ...month.comparison,
            expensesDelta: { amount: brl('0.00'), percent: null },
            incomeDelta: { amount: brl('0.00'), percent: '0.0000' },
          },
        },
      });
      expect(text(screen.getByTestId('kpi-spending-change'))).toBe(pt.dashboard.kpis.delta.noBase);
      expect(text(screen.getByTestId('kpi-income-change'))).toBe(pt.dashboard.kpis.delta.same);
      expect(rerender).toBeDefined();
    });

    it('Dado receita maior, então tom positivo; dado savingsRateDelta, então pontos percentuais', async () => {
      await setup();
      expect(text(screen.getByTestId('kpi-income-change'))).toBe('10% maior que o mês anterior');
      expect(screen.getByTestId('kpi-income-change')).toHaveAttribute('data-tone', 'positive');
      expect(text(screen.getByTestId('kpi-savings-change'))).toBe('+3,8 p.p. vs mês anterior');
      expect(screen.getByTestId('kpi-savings-change')).toHaveAttribute('data-tone', 'positive');
    });

    it('Dado savingsRateDelta negativo, então tom de atenção; dado nulo, então nenhum chip', async () => {
      const month = closedMonth();
      const { fixture } = await setup({
        monthly: { ...month, comparison: { ...month.comparison, savingsRateDelta: '-0.0333' } },
      });
      expect(text(screen.getByTestId('kpi-savings-change'))).toBe('−3,3 p.p. vs mês anterior');
      expect(screen.getByTestId('kpi-savings-change')).toHaveAttribute('data-tone', 'warning');

      fixture.componentRef.setInput('monthly', {
        ...month,
        comparison: { ...month.comparison, savingsRateDelta: null },
      });
      fixture.detectChanges();
      expect(screen.queryByTestId('kpi-savings-change')).not.toBeInTheDocument();
    });
  });

  describe('mês em andamento (partial = true, R5)', () => {
    const partialMonth = () => {
      const month = closedMonth({ partial: true });
      return {
        ...month,
        comparison: {
          ...month.comparison,
          expensesDelta: { amount: brl('-4800.00'), percent: '-0.8000' },
          incomeDelta: { amount: brl('-9000.00'), percent: '-0.9000' },
          savingsRateDelta: '-0.0333',
        },
      };
    };

    it('Dado -80% no dia 10, então o chip é neutro, mostra o valor e o rótulo "em andamento vs anterior inteiro" (nada de "menor")', async () => {
      await setup({ monthly: partialMonth() });

      const chip = screen.getByTestId('kpi-spending-change');
      expect(text(chip)).toBe('−80% · mês em andamento vs mês anterior inteiro');
      expect(chip).toHaveAttribute('data-tone', 'neutral');
      expect(text(chip)).not.toMatch(/menor|maior/);
      expect(screen.getByTestId('kpi-income-change')).toHaveAttribute('data-tone', 'neutral');
      expect(text(screen.getByTestId('kpi-savings-change'))).toBe(
        '−3,3 p.p. · mês em andamento vs mês anterior inteiro',
      );
      expect(screen.getByTestId('kpi-savings-change')).toHaveAttribute('data-tone', 'neutral');
    });

    it('Dado o mês parcial, então a legenda diz "Este mês, em andamento"', async () => {
      await setup({ monthly: partialMonth() });
      expect(text(screen.getByTestId('kpi-spending-caption'))).toBe(
        pt.dashboard.kpis.thisMonthPartial,
      );
    });

    it('Dado partial com percent nulo, então continua "sem base de comparação"', async () => {
      const month = partialMonth();
      await setup({
        monthly: {
          ...month,
          comparison: {
            ...month.comparison,
            expensesDelta: { amount: brl('0.00'), percent: null },
          },
        },
      });
      expect(text(screen.getByTestId('kpi-spending-change'))).toBe(pt.dashboard.kpis.delta.noBase);
    });
  });

  it('Dado projeção, então a legenda diz "Projeção"', async () => {
    await setup({ summary: aDashboardSummary({ isProjection: true }) });
    expect(text(screen.getByTestId('kpi-spending-caption'))).toBe(pt.dashboard.kpis.projection);
  });

  describe('taxa de poupança', () => {
    it('Dado savingsRate nulo, então "—" e "sem receitas no mês", sem anel desenhado', async () => {
      await setup({ monthly: closedMonth({ savingsRate: null }) });
      expect(text(screen.getByTestId('kpi-savings-value'))).toBe('—');
      expect(text(screen.getByTestId('kpi-savings-empty'))).toBe(
        pt.dashboard.kpis.savings.noIncome,
      );
      expect(screen.getByTestId('kpi-savings-ring').querySelector('.ring__arc')).toBeNull();
    });

    it('Dado 0.4120, então o anel desenha o arco da razão (aria-hidden) e o número está em texto', async () => {
      await setup();
      const ring = screen.getByTestId('kpi-savings-ring');
      expect(ring).toHaveAttribute('aria-hidden', 'true');
      expect(ring.querySelector('.ring__arc')).toHaveAttribute('stroke-dasharray', '41.2 100');
    });

    it('Dado taxa negativa (gastou mais que recebeu), então o texto mostra o sinal em tom de risco e não há arco', async () => {
      await setup({ monthly: closedMonth({ savingsRate: '-0.1500' }) });
      const value = screen.getByTestId('kpi-savings-value');
      expect(text(value)).toBe('−15%');
      expect(value).toHaveClass('is-negative');
      expect(screen.getByTestId('kpi-savings-ring').querySelector('.ring__arc')).toBeNull();
    });
  });

  describe('resumo mensal indisponível', () => {
    it('Dado carregando, então os valores do dashboard já aparecem e os chips têm esqueleto (sem inventar variação)', async () => {
      await setup({ monthly: null, status: 'loading' });
      expect(text(screen.getByTestId('kpi-spending-value'))).toBe('R$ 1.620,50');
      expect(screen.queryByTestId('kpi-spending-change')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(pt.dashboard.kpis.loading);
    });

    it('Dado erro, então a taxa mostra "—" e "Indisponível agora" com "Tentar de novo"', async () => {
      const { retry } = await setup({ monthly: null, status: 'error' });
      expect(text(screen.getByTestId('kpi-savings-value'))).toBe('—');
      expect(text(screen.getByTestId('kpi-savings-error'))).toBe(pt.dashboard.kpis.unavailable);

      await userEvent.click(screen.getByTestId('kpi-retry'));

      expect(retry).toHaveBeenCalledTimes(1);
    });
  });

  it('Dado inglês, então a frase de variação vem traduzida e o valor segue na moeda do dado', async () => {
    await setup({ language: 'en' });
    expect(text(screen.getByTestId('kpi-spending-change'))).toBe('4.2% lower than last month');
    expect(text(screen.getByTestId('kpi-spending-value'))).toBe('R$ 1.620,50');
    expect(screen.getByText(en.dashboard.kpis.inAccounts.title)).toBeInTheDocument();
  });

  it('Dado os KPIs (mês encerrado e em andamento), então não há violações de acessibilidade', async () => {
    const { container } = await setup();
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
