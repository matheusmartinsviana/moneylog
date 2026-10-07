import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { DebtsOverviewPage } from '~/app/features/planning/pages/debts-overview.page';
import { failWith, brl } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aCard, CardsGatewayStub, provideCardsStub } from '~/testing/cards-testing';
import {
  aDebtOverview,
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
  const cards = new CardsGatewayStub();
  cards.cards = [aCard({ id: 'card-1', name: 'Nubank' })];
  const result = await render(DebtsOverviewPage, {
    providers: [
      provideI18nTesting('pt'),
      provideRouter([]),
      provideDebtOverviewStub(gateway),
      provideCardsStub(cards),
    ],
  });
  await result.fixture.whenStable();
  return { ...result, gateway };
}

describe('DebtsOverviewPage', () => {
  it('Dado carregando, então mostra o esqueleto com status acessível e nenhum valor', async () => {
    const gateway = new DebtOverviewGatewayStub();
    gateway.overview$ = NEVER;
    await setup(gateway);

    expect(screen.getByTestId('debts-overview-loading')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(pt.debtOverview.loading);
    expect(screen.queryByTestId('debts-total')).not.toBeInTheDocument();
  });

  it('Dado total 6.500,00 no servidor, então mostra o valor e as três partes exatamente como vieram', async () => {
    const { gateway } = await setup();

    expect(gateway.gets).toEqual([12]);
    expect(text(screen.getByTestId('debts-total-value'))).toContain('R$ 6.500,00');
    expect(text(screen.getByTestId('debts-part-cards'))).toBe('R$ 5.000,00');
    expect(text(screen.getByTestId('debts-part-people'))).toBe('R$ 500,00');
    expect(text(screen.getByTestId('debts-part-other'))).toBe('R$ 1.000,00');
  });

  it('Dado o custo fixo, então fica numa seção separada, rotulado como estimativa', async () => {
    await setup();

    const fixed = screen.getByTestId('debts-fixed-costs');
    const total = screen.getByTestId('debts-total');
    expect(fixed).not.toContainElement(total);
    expect(total).not.toContainElement(screen.getByTestId('debts-fixed-value'));
    expect(text(screen.getByTestId('debts-fixed-value'))).toBe('R$ 3.000,00');
    expect(screen.getByTestId('debts-fixed-estimate')).toHaveTextContent(
      pt.debtOverview.fixedCosts.estimate,
    );
  });

  it('Dado uma compra em andamento, então mostra "restam 8 de 10", a parcela e o valor que falta', async () => {
    await setup();

    const plan = text(screen.getByTestId('debts-plan-text-p-1')) ?? '';
    expect(plan).toContain('Restam 8 de 10 parcelas');
    expect(plan).toContain('R$ 150,00 por parcela');
    expect(text(screen.getByTestId('debts-plan-p-1'))).toContain('R$ 1.200,00');
    expect(text(screen.getByTestId('debts-plan-p-1'))).toContain(pt.debtOverview.cards.ongoing);
  });

  it('Dado credor livre, então aparece em "outros credores" com o nome dele e sem link de pessoa', async () => {
    await setup();

    const line = screen.getByTestId('debts-line-d-2');
    expect(line).toHaveTextContent('Banco Azul');
    expect(screen.getByTestId('debts-other')).toContainElement(line);
  });

  it('Dado a comparação, então mostra as razões do servidor formatadas e a renda usada', async () => {
    await setup();

    expect(text(screen.getByTestId('debts-debt-to-income'))).toBe('108,3%');
    expect(text(screen.getByTestId('debts-fixed-to-income'))).toBe('50%');
    expect(text(screen.getByTestId('debts-minus-accounts'))).toBe('R$ 4.500,00');
  });

  it('Dado renda nula (NO_INCOME), então as razões ficam ocultas com o motivo', async () => {
    const gateway = new DebtOverviewGatewayStub();
    gateway.overview$ = of(
      aDebtOverview({
        income: { monthly: null, source: 'NONE' },
        comparison: {
          debtToIncome: null,
          fixedCostToIncome: null,
          debtMinusInAccounts: brl('4500.00'),
          reason: 'NO_INCOME',
        },
      }),
    );
    await setup(gateway);

    expect(screen.getByTestId('debts-no-income')).toHaveTextContent(
      pt.debtOverview.comparison.noIncome,
    );
    expect(screen.queryByTestId('debts-debt-to-income')).not.toBeInTheDocument();
    expect(screen.queryByTestId('debts-fixed-to-income')).not.toBeInTheDocument();
  });

  it('Dado sem previsão de quitação, então o motivo do servidor é explicado', async () => {
    await setup();

    expect(screen.getByTestId('debt-schedule-payoff')).toHaveTextContent(
      pt.debtOverview.schedule.payoff.UNDATED_DEBTS,
    );
    expect(text(screen.getByTestId('debt-schedule-undated'))).toContain('R$ 1.000,00');
  });

  it('Dado nada cadastrado, então explica com os dois caminhos e nunca diz "sem dívidas" nem mostra número', async () => {
    const gateway = new DebtOverviewGatewayStub();
    gateway.overview$ = of(anEmptyDebtOverview());
    await setup(gateway);

    expect(screen.getByText(pt.debtOverview.empty.title)).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-action-ongoing')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-action-debt')).toBeInTheDocument();
    expect(screen.queryByText(pt.debtOverview.none.title)).not.toBeInTheDocument();
    expect(screen.queryByTestId('debts-total')).not.toBeInTheDocument();
  });

  it('Dado cadastro quitado (total zero com registros), então diz que não há dívida em aberto', async () => {
    const gateway = new DebtOverviewGatewayStub();
    gateway.overview$ = of(
      aDebtOverview({
        total: brl('0.00'),
        parts: { cards: brl('0.00'), people: brl('0.00'), other: brl('0.00') },
      }),
    );
    await setup(gateway);

    expect(screen.getByTestId('debts-none')).toHaveTextContent(pt.debtOverview.none.title);
  });

  it('Dado erro de rede, então mostra "tentar de novo" e recarrega', async () => {
    const gateway = new DebtOverviewGatewayStub();
    gateway.overview$ = failWith(0, 'NETWORK');
    await setup(gateway);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    gateway.overview$ = null;
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(await screen.findByTestId('debts-total')).toBeInTheDocument();
    expect(gateway.gets).toEqual([12, 12]);
  });

  it('Dado outro horizonte, então pede o cronograma desse horizonte ao servidor', async () => {
    const { gateway } = await setup();

    await userEvent.click(screen.getByTestId('debts-schedule-months-24'));

    expect(gateway.gets).toEqual([12, 24]);
  });

  it('Dado "Cadastrar o que já está parcelado", então abre o modal do parcelado em andamento', async () => {
    await setup();

    await userEvent.click(screen.getByTestId('debts-add-ongoing'));

    expect(await screen.findByTestId('ongoing-form')).toBeInTheDocument();
  });

  it('Dado a ação do vazio "registrar dívida", então leva ao novo registro de dívida', async () => {
    const gateway = new DebtOverviewGatewayStub();
    gateway.overview$ = of(anEmptyDebtOverview());
    const { fixture } = await setup(gateway);
    const router = fixture.debugElement.injector.get(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await userEvent.click(screen.getByTestId('empty-state-action-debt'));

    expect(navigate).toHaveBeenCalledWith(['/quick-add'], { queryParams: { mode: 'debt' } });
  });

  it('Dado sem meta de quitar dívidas, então convida a criar a meta', async () => {
    await setup();

    expect(screen.getByTestId('debts-goal-create')).toBeInTheDocument();
  });

  it('Dado a meta ainda "montando", então mostra o estado sem percentual e o link para ela', async () => {
    const gateway = new DebtOverviewGatewayStub();
    gateway.overview$ = of(
      aDebtOverview({
        payoffGoal: {
          goalId: 'g-1',
          baselineSet: false,
          progress: '0.0000',
          remaining: brl('6500.00'),
        },
      }),
    );
    await setup(gateway);

    expect(screen.getByTestId('debts-goal')).toHaveTextContent(pt.debtOverview.goal.building);
    expect(screen.getByTestId('debts-goal')).not.toHaveTextContent('%');
    expect(screen.getByTestId('debts-goal-open')).toHaveAttribute('href', '/goals/g-1');
  });

  it('Dado a tela pronta, então não há violações de acessibilidade', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
