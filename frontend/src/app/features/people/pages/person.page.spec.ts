import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { PersonPage } from '~/app/features/people/pages/person.page';
import { brl, failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideNotesStub } from '~/testing/notes-testing';
import {
  aDebtSummary,
  aPersonDetail,
  PeopleGatewayStub,
  providePeopleStub,
} from '~/testing/people-testing';

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

async function setup(gateway = new PeopleGatewayStub(), inputs: { tab?: string } = {}) {
  const result = await render(PersonPage, {
    inputs: { id: 'person-1', ...inputs },
    providers: [
      provideI18nTesting('pt'),
      provideNotesStub(),
      provideRouter([]),
      providePeopleStub(gateway),
    ],
  });
  await result.fixture.whenStable();
  return { ...result, gateway };
}

const detail = () =>
  aPersonDetail({
    debts: [
      aDebtSummary({ id: 'd1', status: 'PARTIALLY_SETTLED', outstanding: brl('200.00') }),
      aDebtSummary({ id: 'd2', status: 'CANCELED', outstanding: brl('0.00') }),
      aDebtSummary({
        id: 'd3',
        direction: 'PAYABLE',
        status: 'OPEN',
        overdue: true,
        expectedDate: null,
        principal: brl('80.00'),
        outstanding: brl('80.00'),
      }),
    ],
  });

describe('PersonPage', () => {
  it('Dado a tela, então mostra o bloco de notas vinculadas ao registro (a página injeta o bloco; nenhum módulo importa notes)', async () => {
    await setup();

    expect(await screen.findByTestId('person-notes-block')).toHaveTextContent('Notas vinculadas');
    expect(screen.getByTestId('person-notes-new')).toBeInTheDocument();
  });

  it('Dado a pessoa, então o título é o nome e a frase do saldo vem do backend', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.detail = detail();
    await setup(gateway);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('João');
    expect(text(screen.getByTestId('person-balance'))).toBe('João deve R$ 150,00');
    expect(text(screen.getByTestId('person-open-debts'))).toBe('1 dívida em aberto');
    expect(text(screen.getByTestId('person-next-due'))).toContain('20 de out.');
  });

  it('Dado net negativo, então a frase é "Você deve ... a João" com o valor sem sinal', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.detail = aPersonDetail({ net: brl('-80.00'), direction: 'PAYABLE' });
    await setup(gateway);

    expect(text(screen.getByTestId('person-balance'))).toBe('Você deve R$ 80,00 a João');
  });

  it('Dado as dívidas, então "Me devem" lista em aberto e encerradas, com o status em texto', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.detail = detail();
    await setup(gateway);

    const open = screen.getByTestId('person-receivable-open');
    expect(within(open).getByTestId('debt-row-d1')).toBeInTheDocument();
    expect(text(screen.getByTestId('debt-status-d1'))).toBe('Parcialmente quitada');
    expect(text(screen.getByTestId('debt-outstanding-d1'))).toBe('R$ 200,00');
    const closed = screen.getByTestId('person-receivable-closed');
    expect(within(closed).getByTestId('debt-row-d2')).toBeInTheDocument();
    expect(text(screen.getByTestId('debt-status-d2'))).toBe('Perdoada');
    expect(screen.queryByTestId('debt-row-d3')).not.toBeInTheDocument();
  });

  it('Dado "?tab=payable", então mostra "Eu devo", com atrasada em texto e dívida sem data', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.detail = detail();
    await setup(gateway, { tab: 'payable' });

    expect(screen.getByTestId('person-tabs-tab-payable')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('debt-row-d3')).toBeInTheDocument();
    expect(text(screen.getByTestId('debt-overdue-d3'))).toBe(pt.debts.row.overdue);
    expect(text(screen.getByTestId('debt-expected-d3'))).toBe(pt.debts.row.noDate);
  });

  it('Dado cada dívida, então leva ao detalhe dela', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.detail = detail();
    await setup(gateway);

    expect(screen.getByTestId('debt-open-d1')).toHaveAttribute('href', '/debts/d1');
  });

  it('Dado nenhuma dívida no sentido, então diz isso', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.detail = aPersonDetail({ debts: [] });
    await setup(gateway);

    expect(screen.getByTestId('person-receivable-empty')).toHaveTextContent(
      pt.people.detail.emptyTab,
    );
  });

  it('Dado as ações, então emprestar e receber levam ao /quick-add com a pessoa', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.detail = detail();
    await setup(gateway);

    expect(screen.getByTestId('person-lend').getAttribute('href')).toBe(
      '/quick-add?mode=loan&personId=person-1',
    );
    expect(screen.getByTestId('person-receive').getAttribute('href')).toBe(
      '/quick-add?mode=received&personId=person-1',
    );
  });

  it('Dado arquivar pelo menu, quando confirmo, então chama o backend e recarrega o detalhe', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.detail = detail();
    const { fixture } = await setup(gateway);

    await userEvent.click(screen.getByTestId('person-actions-menu'));
    await userEvent.click(screen.getByTestId('person-actions-menu-item-archive'));
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await fixture.whenStable();

    expect(gateway.calls).toEqual(['get:person-1', 'archive:person-1', 'get:person-1']);
  });

  it('Dado pessoa arquivada, então avisa e oferece desarquivar; nova dívida fica indisponível', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.detail = aPersonDetail({ archived: true });
    await setup(gateway);

    expect(screen.getByTestId('person-archived')).toHaveTextContent(
      pt.people.detail.archivedBanner,
    );
    await userEvent.click(screen.getByTestId('person-actions-menu'));
    expect(screen.getByTestId('person-actions-menu-item-unarchive')).toBeInTheDocument();
    expect(screen.getByTestId('person-actions-menu-item-newDebt')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('Dado a carga, então mostra o esqueleto com texto para leitor de tela', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.getResult = NEVER as never;
    await render(PersonPage, {
      inputs: { id: 'person-1' },
      providers: [
        provideI18nTesting('pt'),
        provideNotesStub(),
        provideRouter([]),
        providePeopleStub(gateway),
      ],
    });

    expect(screen.getByTestId('person-loading')).toHaveTextContent(pt.people.detail.loading);
  });

  it('Dado 404, então mostra "pessoa não encontrada" com o caminho de volta', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.getResult = failWith(404, 'PERSON_NOT_FOUND');
    await setup(gateway);

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
      pt.people.detail.notFound.title,
    );
    expect(screen.getByTestId('empty-state-action-back')).toHaveAttribute('href', '/people');
  });

  it('Dado erro de rede, então mostra o erro com "tentar de novo" e recarrega', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.getResult = failWith(0, 'NETWORK');
    await setup(gateway);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();

    gateway.getResult = null;
    gateway.detail = detail();
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(await screen.findByTestId('person-balance')).toBeInTheDocument();
  });

  it('Dado a pessoa, então o axe não aponta violações', async () => {
    const gateway = new PeopleGatewayStub();
    gateway.detail = detail();
    const { container } = await setup(gateway);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
