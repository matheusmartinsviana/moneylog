import { DeferBlockBehavior } from '@angular/core/testing';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { en } from '~/app/common/i18n/translations/en';
import { pt } from '~/app/common/i18n/translations/pt';
import { SpendingOverviewComponent } from '~/app/features/home/components/spending-overview/spending-overview.component';
import type { SpendingOverviewState } from '~/modules/reports/core/facades/spending-overview.facade';
import type { ReportPeriod } from '~/modules/reports/core/types/reports';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { anIncomeExpenseSeries } from '~/testing/reports-testing';

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ready = (): SpendingOverviewState => ({ status: 'ready', data: anIncomeExpenseSeries() });

async function setup(
  state: SpendingOverviewState = ready(),
  period: ReportPeriod = 'D7',
  language: 'pt' | 'en' = 'pt',
) {
  const periodChange = vi.fn();
  const retry = vi.fn();
  const result = await render(SpendingOverviewComponent, {
    // O gráfico é um bloco @defer (chunk à parte): o Testing Library o deixa manual por padrão.
    deferBlockBehavior: DeferBlockBehavior.Playthrough,
    providers: [provideI18nTesting(language)],
    inputs: { state, period },
    on: { periodChange, retry },
  });
  return { ...result, periodChange, retry };
}

describe('SpendingOverviewComponent', () => {
  it('Dado a série, então mostra os 4 períodos (o atual marcado), a base e os totais do backend', async () => {
    await setup();

    const group = screen.getByRole('radiogroup', { name: pt.dashboard.overview.periodLabel });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.textContent?.trim()),
    ).toEqual(['7 dias', '30 dias', '3 meses', '12 meses']);
    expect(screen.getByTestId('home-overview-period-D7')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('home-overview-basis')).toHaveTextContent(
      pt.dashboard.overview.basis.DATE,
    );
    expect(text(screen.getByTestId('home-overview-income'))).toBe('R$ 3.000,00');
    expect(text(screen.getByTestId('home-overview-expenses'))).toBe('R$ 250,00');
    // `net` é "Resultado do período" (receita menos consumo), nunca "saldo".
    expect(screen.getByText(pt.dashboard.overview.net)).toBeInTheDocument();
    expect(text(screen.getByTestId('home-overview-net'))).toBe('R$ 2.750,00');
    expect(screen.queryByText(/^saldo/i)).not.toBeInTheDocument();
  });

  it('Dado basis COMPETENCE, então o rótulo diz "por competência"', async () => {
    await setup({
      status: 'ready',
      data: anIncomeExpenseSeries({ basis: 'COMPETENCE', granularity: 'MONTH', period: 'M12' }),
    });
    expect(screen.getByTestId('home-overview-basis')).toHaveTextContent(
      pt.dashboard.overview.basis.COMPETENCE,
    );
  });

  it('Dado a série, então o gráfico usa os valores do backend (tabela equivalente = JSON) e o negativo vem com o sinal', async () => {
    await setup();

    const table = await screen.findByRole('table', { hidden: true });
    const rows = within(table).getAllByRole('row', { hidden: true });
    // Cabeçalho + 7 dias; os valores são os do JSON (o 6º dia tem despesa negativa: reembolso).
    expect(rows).toHaveLength(8);
    expect(text(rows[6]!)).toContain('−R$ 50,00');
    expect(text(rows[7]!)).toContain('R$ 300,00');
    expect(await screen.findByTestId('home-overview-chart')).toBeInTheDocument();
  });

  it('Dado a troca de período, então emite o período escolhido (quem carrega é o pai)', async () => {
    const { periodChange } = await setup();

    await userEvent.click(screen.getByTestId('home-overview-period-M3'));

    expect(periodChange).toHaveBeenCalledWith('M3');
  });

  it('Dado o teclado, então as setas do controle trocam o período (padrão do SegmentedControl)', async () => {
    const { periodChange } = await setup(ready(), 'D7');

    screen.getByTestId('home-overview-period-D7').focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(periodChange).toHaveBeenCalledWith('D30');
  });

  it('Dado o período do pai mudar, então o controle acompanha sem emitir de novo', async () => {
    const { fixture, periodChange } = await setup(ready(), 'D7');

    fixture.componentRef.setInput('period', 'M12');
    fixture.detectChanges();

    expect(screen.getByTestId('home-overview-period-M12')).toHaveAttribute('aria-checked', 'true');
    expect(periodChange).not.toHaveBeenCalled();
  });

  it('Dado carregando, então esqueleto com status acessível e sem gráfico', async () => {
    await setup({ status: 'loading' });
    expect(screen.getByTestId('home-overview-loading')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(pt.dashboard.overview.loading);
    expect(screen.queryByTestId('home-overview-chart')).not.toBeInTheDocument();
  });

  it('Dado erro, então mostra a mensagem e "tentar de novo" emite retry', async () => {
    const { retry } = await setup({
      status: 'error',
      problem: { status: 500, code: 'X', fieldErrors: [], traceId: null, retryAfterSeconds: null },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(pt.dashboard.overview.error);
    await userEvent.click(screen.getByTestId('home-overview-retry'));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('Dado nenhum balde, então o estado vazio é honesto (sem linha reta fingindo dado)', async () => {
    await setup({ status: 'empty', data: anIncomeExpenseSeries({ points: [] }) });
    expect(screen.getByTestId('home-overview-empty')).toHaveTextContent(
      pt.dashboard.overview.empty,
    );
    expect(screen.queryByTestId('home-overview-chart')).not.toBeInTheDocument();
  });

  it('Dado inglês, então os rótulos e os períodos vêm traduzidos', async () => {
    await setup(ready(), 'D7', 'en');
    expect(screen.getByText(en.dashboard.overview.net)).toBeInTheDocument();
    expect(screen.getByTestId('home-overview-period-M12')).toHaveTextContent('12 months');
  });

  it('Dado o cartão pronto, então não há violações de acessibilidade', async () => {
    const { container } = await setup();
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
