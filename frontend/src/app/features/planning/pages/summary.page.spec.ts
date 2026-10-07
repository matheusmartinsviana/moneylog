import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { SummaryPage } from '~/app/features/planning/pages/summary.page';
import { brl, failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aSummary,
  MonthlySummaryGatewayStub,
  provideMonthlySummaryStub,
} from '~/testing/etapa5-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideNotesStub } from '~/testing/notes-testing';

vi.setConfig({ testTimeout: 30_000 });

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

async function setup(
  gateway = new MonthlySummaryGatewayStub(),
  month: string | undefined = '2026-10',
) {
  const result = await render(SummaryPage, {
    inputs: { month },
    providers: [
      provideI18nTesting('pt'),
      provideNotesStub(),
      provideRouter([]),
      provideMonthlySummaryStub(gateway),
    ],
  });
  await result.fixture.whenStable();
  return { ...result, gateway, router: TestBed.inject(Router) };
}

describe('SummaryPage', () => {
  it('Dado a tela, então mostra o bloco de notas vinculadas ao registro (a página injeta o bloco; nenhum módulo importa notes)', async () => {
    await setup();

    expect(await screen.findByTestId('summary-notes-block')).toHaveTextContent(
      'Vinculada à revisão mensal',
    );
    expect(screen.getByTestId('summary-notes-new')).toBeInTheDocument();
  });

  it('Dado outubro de 2026 do cenário, então mostra receitas, despesas, investimentos (linha própria), saldo e economia, tudo do backend', async () => {
    await setup();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Resumo de outubro de 2026',
    );
    expect(text(screen.getByTestId('summary-income'))).toContain('R$ 3.000,00');
    expect(text(screen.getByTestId('summary-expenses'))).toContain('R$ 250,00');
    expect(text(screen.getByTestId('summary-investments'))).toContain('R$ 10.000,00');
    expect(text(screen.getByTestId('summary-investments-note'))).toContain(
      'Ficam fora das despesas',
    );
    expect(text(screen.getByTestId('summary-net'))).toContain('R$ 2.750,00');
    expect(text(screen.getByTestId('summary-savings-text'))).toBe('91,7%');
  });

  it('Dado a maior categoria e o maior gasto, então mostra a parcela com o número e o link para a movimentação', async () => {
    await setup();

    expect(text(screen.getByTestId('summary-largest-category'))).toContain('Tecnologia');
    expect(text(screen.getByTestId('summary-largest-category'))).toContain('R$ 200,00');
    const link = screen.getByTestId('summary-largest-expense-link');
    expect(text(link)).toBe('Notebook (1/6)');
    expect(link).toHaveAttribute('href', '/transactions/tx-notebook');
  });

  it('Dado o maior gasto vindo de uma dívida de consumo, então o link leva à dívida', async () => {
    const gateway = new MonthlySummaryGatewayStub();
    const base = aSummary();
    gateway.result = () =>
      of(
        aSummary({
          largestExpense: {
            ...base.largestExpense!,
            transactionId: null,
            debtId: 'debt-1',
            installmentNumber: null,
            installmentTotal: null,
            description: 'Jantar',
          },
        }),
      );
    await setup(gateway);

    expect(screen.getByTestId('summary-largest-expense-link')).toHaveAttribute(
      'href',
      '/debts/debt-1',
    );
  });

  it('Dado cartão e parcelas futuras, então mostra consumo no crédito, faturas do mês e parcelas futuras', async () => {
    await setup();

    expect(text(screen.getByTestId('summary-card-consumption'))).toContain('R$ 200,00');
    expect(text(screen.getByTestId('summary-card-outstanding'))).toContain('R$ 200,00');
    expect(text(screen.getByTestId('summary-future-installments'))).toContain('R$ 1.000,00');
  });

  it('Dado a comparação com setembro, então diz subiu e caiu em palavras, com valor e percentual do backend', async () => {
    await setup();

    expect(
      text(screen.getByRole('heading', { name: /Comparação com setembro de 2026/ })),
    ).toBeTruthy();
    expect(text(screen.getByTestId('summary-delta-expenses-text'))).toBe('Subiu R$ 100,00 (66,7%)');
    expect(text(screen.getByTestId('summary-delta-net-text'))).toBe('Caiu R$ 100,00 (3,5%)');
    expect(text(screen.getByTestId('summary-delta-income-text'))).toBe('Igual ao mês anterior');
  });

  it('Dado base zero (percent nulo), então mostra só o valor, sem inventar percentual', async () => {
    await setup();

    expect(text(screen.getByTestId('summary-delta-investments-text'))).toBe('Subiu R$ 10.000,00');
  });

  it('Dado partial, então rotula "mês em andamento" e a comparação diz que é parcial', async () => {
    await setup();

    expect(screen.getByTestId('summary-partial')).toHaveTextContent(pt.summary.partial);
    expect(screen.getByTestId('summary-comparison-partial')).toHaveTextContent(
      pt.summary.comparison.partialNote,
    );
  });

  it('Dado mês passado, então não há rótulo de parcial', async () => {
    const gateway = new MonthlySummaryGatewayStub();
    gateway.result = (month) => of(aSummary({ competence: month, partial: false }));
    await setup(gateway, '2026-09');

    expect(screen.queryByTestId('summary-partial')).not.toBeInTheDocument();
    expect(screen.queryByTestId('summary-comparison-partial')).not.toBeInTheDocument();
  });

  it('Dado mês futuro (isProjection), então avisa que só aparece o que já existe', async () => {
    const gateway = new MonthlySummaryGatewayStub();
    gateway.result = (month) => of(aSummary({ competence: month, isProjection: true }));
    await setup(gateway, '2027-01');

    expect(screen.getByTestId('summary-projection')).toHaveTextContent(pt.summary.projection);
  });

  it('Dado savingsRate nulo, então mostra "—" com a explicação "sem receitas no mês"', async () => {
    const gateway = new MonthlySummaryGatewayStub();
    gateway.result = (month) =>
      of(aSummary({ competence: month, savingsRate: null, income: brl('0.00') }));
    await setup(gateway);

    expect(text(screen.getByTestId('summary-savings-text'))).toBe('—');
    expect(screen.getByTestId('summary-savings-note')).toHaveTextContent(
      pt.summary.savingsRateEmpty,
    );
  });

  it('Dado mês sem maior categoria nem maior gasto, então diz "nada registrado"', async () => {
    const gateway = new MonthlySummaryGatewayStub();
    gateway.result = (month) =>
      of(aSummary({ competence: month, largestCategory: null, largestExpense: null }));
    await setup(gateway);

    expect(screen.getByTestId('summary-largest-category-none')).toBeInTheDocument();
    expect(screen.getByTestId('summary-largest-expense-none')).toBeInTheDocument();
  });

  it('Dado trocar o mês no seletor, então a URL muda (e o F5 volta ao mesmo mês)', async () => {
    const { router } = await setup();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await userEvent.click(screen.getByTestId('summary-month'));
    await userEvent.click(await screen.findByTestId('summary-month-grid-2026-09'));

    expect(navigate).toHaveBeenCalledWith(['/planning/summary', '2026-09']);
  });

  it('Dado o mês da URL, então o seletor o mostra e o backend recebe esse mês', async () => {
    const { gateway } = await setup(new MonthlySummaryGatewayStub(), '2026-08');

    expect(gateway.months).toEqual(['2026-08']);
    expect(text(screen.getByTestId('summary-month'))).toContain('agosto');
  });

  it('Dado a análise com IA (Etapa 8), então só há um texto honesto e nenhum botão que não faz nada', async () => {
    await setup();

    expect(screen.getByTestId('summary-analyze-note')).toHaveTextContent(pt.summary.analyzeOff);
    expect(screen.queryByTestId('summary-analyze')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /IA/ })).not.toBeInTheDocument();
  });

  it('Dado mês inválido na URL, então diz que não é válido e oferece o mês atual, sem chamar o backend', async () => {
    const { gateway } = await setup(new MonthlySummaryGatewayStub(), '2026-13');

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
      pt.summary.invalidMonth.title,
    );
    expect(gateway.months).toEqual([]);
  });

  it('Dado a carga, então mostra o esqueleto com texto para leitor de tela', async () => {
    const gateway = new MonthlySummaryGatewayStub();
    gateway.result = () => NEVER;
    await setup(gateway);

    expect(screen.getByTestId('summary-loading')).toHaveTextContent(pt.summary.loading);
  });

  it('Dado erro, então oferece "tentar de novo", que pede o mesmo mês', async () => {
    const gateway = new MonthlySummaryGatewayStub();
    gateway.result = () => failWith(500, 'INTERNAL_ERROR');
    await setup(gateway);

    gateway.result = null;
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(gateway.months).toEqual(['2026-10', '2026-10']);
    expect(await screen.findByTestId('summary-income')).toBeInTheDocument();
  });

  it('Dado sem mês na URL, então abre o mês de hoje (só ponto de partida: partial vem da API)', async () => {
    const { gateway } = await setup(new MonthlySummaryGatewayStub(), undefined);

    expect(gateway.months).toHaveLength(1);
    expect(gateway.months[0]).toMatch(/^\d{4}-\d{2}$/);
  });

  it('Dado o resumo, então não tem violações de acessibilidade', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
