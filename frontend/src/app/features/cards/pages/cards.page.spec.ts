import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { CardsPage } from '~/app/features/cards/pages/cards.page';
import { brl, failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aCard,
  anInvoiceSummary,
  CardsGatewayStub,
  provideCardsStub,
} from '~/testing/cards-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

async function setup(gateway = new CardsGatewayStub(), inputs: { status?: string } = {}) {
  const result = await render(CardsPage, {
    inputs,
    providers: [provideI18nTesting('pt'), provideRouter([]), provideCardsStub(gateway)],
  });
  return { ...result, gateway, toast: TestBed.inject(ToastService) };
}

describe('CardsPage', () => {
  it('Dado nenhum cartão, então o estado vazio mostra "Adicionar cartão" habilitado, levando a /cards/new', async () => {
    await setup();

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.emptyState.cards.title);
    const action = screen.getByTestId('empty-state-action-add-card');
    expect(action).toHaveAttribute('href', '/cards/new');
    expect(action).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('cards-add')).toHaveAttribute('href', '/cards/new');
  });

  it('Dado a carga, então mostra o esqueleto com texto para leitor de tela', async () => {
    const gateway = new CardsGatewayStub();
    gateway.listError = NEVER as never;
    await setup(gateway);

    expect(screen.getByTestId('cards-loading')).toHaveTextContent(pt.cards.loading);
  });

  it('Dado cartões, então a lista mostra nome, instituição, disponível, fatura atual e vencimento com os valores da API', async () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [
      aCard({
        id: 'a',
        name: 'Roxinho',
        institution: 'Nubank',
        availableLimit: brl('7717.00'),
        currentInvoice: anInvoiceSummary({
          referenceMonth: '2026-11',
          dueDate: '2026-11-05',
          outstanding: brl('1283.00'),
        }),
      }),
    ];
    await setup(gateway);

    const row = screen.getByTestId('card-row-a');
    expect(within(row).getByText('Roxinho')).toBeInTheDocument();
    expect(text(screen.getByTestId('card-institution-a'))).toBe('Nubank');
    expect(text(screen.getByTestId('card-limit-a-text'))).toBe(
      'R$ 7.717,00 disponíveis de R$ 10.000,00',
    );
    expect(text(screen.getByTestId('card-invoice-a'))).toContain(
      'Fatura de nov/2026 · vence 5 de nov. · R$ 1.283,00',
    );
    expect(screen.getByTestId('card-invoice-a').querySelector('.num')).not.toBeNull();
  });

  it('Dado a barra de limite, então a largura é o usedRatio do backend e tem valor anunciado', async () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [aCard({ id: 'a', usedRatio: 0.3333 })];
    await setup(gateway);

    const track = screen.getByTestId('card-limit-a-track');
    expect(track).toHaveAttribute('role', 'progressbar');
    expect(track).toHaveAttribute('aria-valuenow', '33');
    expect(track.getAttribute('aria-valuetext')?.replace(/\u00a0/g, ' ')).toBe(
      'R$ 7.717,00 disponíveis de R$ 10.000,00',
    );
  });

  it('Dado acima do limite, então aparece "acima do limite" com texto (não só cor) e o disponível negativo do backend', async () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [
      aCard({ id: 'a', overLimit: true, availableLimit: brl('-200.00'), usedRatio: 1 }),
    ];
    await setup(gateway);

    expect(screen.getByTestId('card-over-limit-a')).toHaveTextContent(pt.cards.limit.overLimit);
    expect(text(screen.getByTestId('card-limit-a-text'))).toContain('−R$ 200,00');
    expect(text(screen.getByTestId('card-limit-a-text'))).toContain(pt.form.progress.risk);
  });

  it('Dado crédito no cartão maior que zero, então mostra "crédito no cartão"; zero, não', async () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [
      aCard({ id: 'a', creditBalance: brl('17.00') }),
      aCard({ id: 'b', creditBalance: brl('0.00') }),
    ];
    await setup(gateway);

    expect(text(screen.getByTestId('card-credit-a'))).toBe('Crédito no cartão R$ 17,00');
    expect(screen.queryByTestId('card-credit-b')).not.toBeInTheDocument();
  });

  it('Dado cartão sem fatura corrente, então diz que não há fatura aberta', async () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [aCard({ id: 'a', currentInvoice: null })];
    await setup(gateway);

    expect(screen.getByTestId('card-invoice-a')).toHaveTextContent(pt.cards.noInvoice);
  });

  it('Dado "?status=ARCHIVED", então pede os arquivados e oferece desarquivar', async () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [aCard({ id: 'z', status: 'ARCHIVED' }), aCard({ id: 'a' })];
    await setup(gateway, { status: 'ARCHIVED' });

    expect(gateway.queries.at(-1)?.status).toBe('ARCHIVED');
    expect(screen.getByTestId('cards-tab-archived')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('card-unarchive-z')).toBeInTheDocument();
    expect(screen.queryByTestId('card-row-a')).not.toBeInTheDocument();
  });

  it('Dado nenhum arquivado, então diz isso sem a ação de adicionar', async () => {
    await setup(new CardsGatewayStub(), { status: 'ARCHIVED' });

    expect(screen.getByTestId('cards-empty-archived')).toHaveTextContent(pt.cards.emptyArchived);
  });

  it('Dado erro de rede, então mostra o erro com "tentar de novo" e recarrega', async () => {
    const gateway = new CardsGatewayStub();
    gateway.listError = failWith(0, 'NETWORK');
    await setup(gateway);

    expect(screen.getByTestId('error-state')).toHaveTextContent(pt.errors.codes['NETWORK']!);
    gateway.listError = null;
    gateway.cards = [aCard({ id: 'a' })];
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(await screen.findByTestId('card-row-a')).toBeInTheDocument();
  });

  it('Dado arquivar um cartão arquivável, quando confirmo, então usa o cartão devolvido e avisa', async () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [aCard({ id: 'a', archivable: true })];
    const { toast, fixture } = await setup(gateway);

    await userEvent.click(screen.getByTestId('card-archive-a'));
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await fixture.whenStable();

    expect(gateway.calls).toContain('archive:a');
    expect(toast.toasts()[0]?.message).toBe(pt.cards.toast.archived);
    expect(screen.queryByTestId('card-row-a')).not.toBeInTheDocument();
  });

  it('Dado cartão não arquivável, então "Arquivar" fica desabilitado (aria-disabled) com a razão e não envia', async () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [aCard({ id: 'a', archivable: false })];
    await setup(gateway);

    const button = screen.getByTestId('card-archive-a');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(pt.cards.archiveHint);
    await userEvent.click(button);
    expect(screen.queryByTestId('confirm-dialog-confirm')).not.toBeInTheDocument();
  });

  it('Dado CARD_HAS_PENDING_BALANCE ao arquivar, então explica o que falta e leva à tela do cartão', async () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [aCard({ id: 'a', name: 'Roxinho', archivable: true })];
    await setup(gateway);
    gateway.next = failWith(422, 'CARD_HAS_PENDING_BALANCE');

    await userEvent.click(screen.getByTestId('card-archive-a'));
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    const banner = await screen.findByTestId('cards-pending-balance');
    expect(banner).toHaveTextContent('pague as faturas em aberto e cancele as parcelas futuras');
    expect(screen.getByTestId('cards-pending-balance-link')).toHaveAttribute('href', '/cards/a');
    expect(screen.getByTestId('card-row-a')).toBeInTheDocument();
  });

  it('Dado a lista, então o axe não aponta violações', async () => {
    const gateway = new CardsGatewayStub();
    gateway.cards = [aCard({ id: 'a' }), aCard({ id: 'b', archivable: false, overLimit: true })];
    const { container } = await setup(gateway);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
