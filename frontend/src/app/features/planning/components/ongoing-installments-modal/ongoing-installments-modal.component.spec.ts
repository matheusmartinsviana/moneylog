import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Subject } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { OngoingInstallmentsModalComponent } from '~/app/features/planning/components/ongoing-installments-modal/ongoing-installments-modal.component';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aCard, CardsGatewayStub, provideCardsStub } from '~/testing/cards-testing';
import {
  anOngoingPreview,
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

async function setup(gateway = new DebtOverviewGatewayStub(), cards = [aCard({ id: 'card-1' })]) {
  const cardsGateway = new CardsGatewayStub();
  cardsGateway.cards = cards;
  const result = await render(OngoingInstallmentsModalComponent, {
    inputs: { cardId: 'card-1' },
    providers: [
      provideI18nTesting('pt'),
      provideRouter([]),
      provideDebtOverviewStub(gateway),
      provideCardsStub(cardsGateway),
    ],
  });
  await result.fixture.whenStable();
  return { ...result, gateway };
}

async function fill() {
  await userEvent.type(screen.getByTestId('ongoing-description-field'), 'Notebook');
  await userEvent.type(screen.getByTestId('ongoing-installment-amount'), '150');
  await userEvent.type(screen.getByTestId('ongoing-total'), '10');
  await userEvent.type(screen.getByTestId('ongoing-remaining'), '8');
}

describe('OngoingInstallmentsModalComponent', () => {
  it('Dado o modal aberto, então explica que só as parcelas que faltam entram e que "3 de 10" são 8', async () => {
    await setup();

    expect(screen.getByTestId('ongoing-description')).toHaveTextContent(
      pt.debtOverview.ongoing.description,
    );
    expect(screen.getByTestId('ongoing-remaining-hint')).toHaveTextContent('faltam 8');
  });

  it('Dado parcela 150,00, total 10 e faltam 8, então a prévia é a do servidor (sem somar no front)', async () => {
    const { gateway } = await setup();
    // Resposta do servidor deliberadamente diferente de 8 × 150: a tela mostra o que veio.
    gateway.previewResult = (await import('rxjs')).of(
      anOngoingPreview({ remaining: { amount: '1199.99', currency: 'BRL' } }),
    );

    await fill();
    const preview = await screen.findByTestId('ongoing-preview-text', {}, { timeout: 3000 });

    expect(text(preview)).toBe('Faltam R$ 1.199,99 em 8 parcelas, até 10 de junho de 2027.');
    expect(gateway.previews.at(-1)?.input).toMatchObject({
      installmentAmount: '150.00',
      totalInstallments: 10,
      remainingInstallments: 8,
    });
  });

  it('Dado duplo toque em salvar, então um só envio e o botão fica desabilitado enquanto envia', async () => {
    const gateway = new DebtOverviewGatewayStub();
    const pending = new Subject<string>();
    gateway.createResult = pending;
    const { fixture } = await setup(gateway);
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    await fill();

    const save = screen.getByTestId('ongoing-save');
    await userEvent.dblClick(save);

    expect(gateway.creates).toHaveLength(1);
    expect(save).toBeDisabled();
    pending.next('tx-1');
    pending.complete();
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('Dado 422 ONGOING_INVALID_COUNT, então o erro aparece no campo de quantas faltam', async () => {
    const gateway = new DebtOverviewGatewayStub();
    gateway.createResult = failWith(422, 'ONGOING_INVALID_COUNT');
    await setup(gateway);
    await fill();

    await userEvent.click(screen.getByTestId('ongoing-save'));

    expect(await screen.findByText(pt.errors.codes['ONGOING_INVALID_COUNT']!)).toBeInTheDocument();
    expect(screen.queryByTestId('ongoing-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('ongoing-save')).toBeEnabled();
  });

  it('Dado campos vazios, então não envia nada', async () => {
    const { gateway } = await setup();

    await userEvent.click(screen.getByTestId('ongoing-save'));

    expect(gateway.creates).toHaveLength(0);
  });

  it('Dado nenhum cartão cadastrado, então convida a cadastrar um cartão', async () => {
    await setup(new DebtOverviewGatewayStub(), []);

    expect(screen.getByTestId('ongoing-no-cards')).toHaveTextContent(
      pt.debtOverview.ongoing.noCards,
    );
    expect(screen.getByTestId('ongoing-add-card')).toHaveAttribute('href', '/cards/new');
  });

  it('Dado o formulário, então não há violações de acessibilidade', async () => {
    await setup();

    const violations = await axeViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
