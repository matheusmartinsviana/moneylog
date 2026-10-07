import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { firstValueFrom, map, NEVER, of } from 'rxjs';

import { LinkPickerSheetComponent } from '~/app/features/notes/components/link-picker-sheet/link-picker-sheet.component';
import type { NoteLinkRef } from '~/modules/notes/core/types/note';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aCard,
  anInvoiceSummary,
  CardsGatewayStub,
  provideCardsStub,
} from '~/testing/cards-testing';
import { aDebt, DebtsGatewayStub, provideDebtsStub } from '~/testing/debts-testing';
import { aGoal, GoalsGatewayStub, provideGoalsStub } from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { aPerson, PeopleGatewayStub, providePeopleStub } from '~/testing/people-testing';
import {
  aTransaction,
  provideTransactionsStub,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';
import type { Problem } from '~/util/api/problem';

vi.setConfig({ testTimeout: 30_000 });

async function setup(
  inputs: Partial<{ existing: NoteLinkRef[]; busy: boolean; problem: Problem | null }> = {},
) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const gateways = {
    tx: new TransactionsGatewayStub(),
    people: new PeopleGatewayStub(),
    goals: new GoalsGatewayStub(),
    debts: new DebtsGatewayStub(),
    cards: new CardsGatewayStub(),
  };
  const chosen: NoteLinkRef[] = [];
  const closed = vi.fn();
  const result = await render(LinkPickerSheetComponent, {
    inputs: { open: true, ...inputs },
    on: { chosen: (ref: NoteLinkRef) => chosen.push(ref), closed },
    providers: [
      provideI18nTesting('pt'),
      provideTransactionsStub(gateways.tx),
      providePeopleStub(gateways.people),
      provideGoalsStub(gateways.goals),
      provideDebtsStub(gateways.debts),
      provideCardsStub(gateways.cards),
    ],
  });
  const settle = async () => {
    await vi.advanceTimersByTimeAsync(400);
    await result.fixture.whenStable();
    result.fixture.detectChanges();
  };
  await settle();
  return { ...result, gateways, chosen, closed, settle };
}

async function chooseType(label: string) {
  await userEvent.click(screen.getByTestId('picker-type'));
  await userEvent.click(screen.getByRole('option', { name: label }));
}

describe('LinkPickerSheetComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado abrir, então começa em "Movimentação" com a busca como combobox e a lista como listbox', async () => {
    await setup();

    const search = screen.getByTestId('picker-search');
    expect(search).toHaveAttribute('role', 'combobox');
    expect(search).toHaveAttribute('aria-autocomplete', 'list');
    expect(screen.getByRole('listbox', { name: 'Resultados', hidden: true })).toBeInTheDocument();
    expect(screen.getByTestId('picker-type')).toHaveTextContent('Movimentação');
  });

  it('Dado digitar, então a busca usa a porta de transações (sem período, só o texto) e vincula pelo id', async () => {
    const { gateways, chosen, settle } = await setup();
    gateways.tx.listCalls.length = 0;

    await userEvent.type(screen.getByTestId('picker-search'), 'almo');
    await settle();

    const call = gateways.tx.listCalls.at(-1);
    expect(call?.filters).toMatchObject({ q: 'almo', from: null, to: null, status: 'ACTIVE' });
    expect(call?.pageSize).toBe(10);
    const option = screen.getByTestId('picker-option-tx-1');
    expect(option).toHaveTextContent('Almoço');
    expect(option).toHaveTextContent('R$ 35,00');
    await userEvent.click(option);

    expect(chosen).toEqual([{ type: 'TRANSACTION', id: 'tx-1' }]);
  });

  it('Dado as setas e Enter, então escolhe a opção ativa; o campo aponta para ela e a quantidade é anunciada', async () => {
    const { gateways, chosen, settle } = await setup();
    const base = await firstValueFrom(gateways.tx.list$(1));
    gateways.tx.list$ = () =>
      of({
        ...base,
        items: [
          aTransaction({ id: 'a', description: 'Notebook' }),
          aTransaction({ id: 'b', description: 'Mouse' }),
        ],
      });
    await userEvent.type(screen.getByTestId('picker-search'), 'n');
    await settle();

    const search = screen.getByTestId('picker-search');
    const options = screen.getAllByRole('option');
    expect(search.getAttribute('aria-activedescendant')).toBe(options[0]!.id);
    expect(search).toHaveAttribute('aria-expanded', 'true');
    expect(search.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    expect(search.getAttribute('aria-activedescendant')).toBe(options[1]!.id);
    await userEvent.keyboard('{Enter}');

    expect(chosen).toEqual([{ type: 'TRANSACTION', id: 'b' }]);
  });

  it('Dado "Pessoa", então busca pelo nome na porta de pessoas', async () => {
    const { gateways, chosen, settle } = await setup();
    gateways.people.people = [
      aPerson({ id: 'p1', name: 'João' }),
      aPerson({ id: 'p2', name: 'Maria' }),
    ];
    await chooseType('Pessoa');
    await userEvent.type(screen.getByTestId('picker-search'), 'mar');
    await settle();

    expect(gateways.people.queries.at(-1)).toMatchObject({ q: 'mar', status: 'ACTIVE' });
    await userEvent.click(screen.getByTestId('picker-option-p2'));

    expect(chosen).toEqual([{ type: 'PERSON', id: 'p2' }]);
  });

  it('Dado "Meta", então filtra as metas por nome sem diferenciar acento', async () => {
    const { gateways, chosen, settle } = await setup();
    gateways.goals.goals = [
      aGoal({ id: 'g1', name: 'Reserva de emergência' }),
      aGoal({ id: 'g2', name: 'Viagem' }),
    ];
    await chooseType('Meta');
    await userEvent.type(screen.getByTestId('picker-search'), 'EMERGENCIA');
    await settle();

    expect(screen.queryByTestId('picker-option-g2')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('picker-option-g1'));

    expect(chosen).toEqual([{ type: 'GOAL', id: 'g1' }]);
  });

  it('Dado "Dívida", então oferece pessoa e descrição com o saldo devedor do backend', async () => {
    const { gateways, chosen, settle } = await setup();
    gateways.debts.debts = [aDebt({ id: 'd1' })];
    await chooseType('Dívida');
    await settle();

    expect(screen.getByTestId('picker-option-d1')).toHaveTextContent('João · Empréstimo');
    expect(screen.getByTestId('picker-option-d1')).toHaveTextContent('R$ 200,00');
    await userEvent.click(screen.getByTestId('picker-option-d1'));

    expect(chosen).toEqual([{ type: 'DEBT', id: 'd1' }]);
  });

  it('Dado "Cartão", então lista os cartões ativos', async () => {
    const { gateways, chosen, settle } = await setup();
    gateways.cards.cards = [aCard({ id: 'c1', name: 'Roxinho' })];
    await chooseType('Cartão');
    await settle();

    expect(gateways.cards.queries.at(-1)).toMatchObject({ status: 'ACTIVE' });
    await userEvent.click(screen.getByTestId('picker-option-c1'));

    expect(chosen).toEqual([{ type: 'CARD', id: 'c1' }]);
  });

  it('Dado "Fatura", então primeiro pede o cartão e depois lista as faturas dele (mais recente primeiro)', async () => {
    const { gateways, chosen, settle } = await setup();
    gateways.cards.cards = [aCard({ id: 'c1', name: 'Roxinho' })];
    gateways.cards.invoices = [
      anInvoiceSummary({ id: 'inv-old', referenceMonth: '2026-09' }),
      anInvoiceSummary({ id: 'inv-new', referenceMonth: '2026-11' }),
    ];
    await chooseType('Fatura');
    await settle();

    expect(screen.queryByTestId('picker-search')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('option', { hidden: true }).length).toBe(0);
    await userEvent.click(screen.getByTestId('picker-card'));
    await userEvent.click(screen.getByRole('option', { name: /Roxinho/ }));
    await settle();

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('Fatura de novembro de 2026');
    expect(options[1]).toHaveTextContent('Fatura de setembro de 2026');
    await userEvent.click(screen.getByTestId('picker-option-inv-new'));

    expect(chosen).toEqual([{ type: 'INVOICE', id: 'inv-new' }]);
  });

  it('Dado "Resumo mensal", então escolhe o mês (AAAA-MM) e vincula pela chave', async () => {
    const { chosen } = await setup();
    await chooseType('Resumo mensal');

    expect(screen.getByTestId('picker-add-month')).toBeDisabled();
    await userEvent.click(screen.getByTestId('picker-month'));
    await userEvent.click(await screen.findByTestId('picker-month-grid-2026-10'));
    await userEvent.click(screen.getByTestId('picker-add-month'));

    expect(chosen).toEqual([{ type: 'MONTHLY_SUMMARY', key: '2026-10' }]);
  });

  it('Dado registro já vinculado, então aparece "Já vinculada" e não vincula de novo', async () => {
    const { chosen, settle } = await setup({ existing: [{ type: 'TRANSACTION', id: 'tx-1' }] });
    await userEvent.type(screen.getByTestId('picker-search'), 'a');
    await settle();

    const option = screen.getByTestId('picker-option-tx-1');
    expect(option).toHaveTextContent('Já vinculada');
    expect(option).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(option);

    expect(chosen).toEqual([]);
  });

  it('Dado nenhum resultado, então diz "Nada encontrado"', async () => {
    const { settle } = await setup();
    await chooseType('Meta');
    await userEvent.type(screen.getByTestId('picker-search'), 'zzz');
    await settle();

    expect(screen.getByTestId('picker-empty')).toHaveTextContent('Nada encontrado.');
  });

  it('Dado falha na busca, então mostra o erro com "Tentar de novo"', async () => {
    const { gateways, settle } = await setup();
    gateways.people.listError = failWith(500, 'INTERNAL_ERROR');
    await chooseType('Pessoa');
    await settle();
    expect(screen.getByTestId('picker-search-error')).toBeInTheDocument();

    gateways.people.listError = null;
    gateways.people.people = [aPerson({ id: 'p1' })];
    await userEvent.click(screen.getByTestId('picker-retry'));
    await settle();

    expect(screen.getByTestId('picker-option-p1')).toBeInTheDocument();
  });

  it('Dado a busca em andamento, então mostra "Buscando..."', async () => {
    const { gateways } = await setup();
    gateways.people.listError = NEVER as never;
    await chooseType('Pessoa');

    expect(screen.getByTestId('picker-loading')).toBeInTheDocument();
    expect(aGoal().id).toBe('goal-1');
    expect(map).toBeDefined();
  });

  it('Dado NOTE_LINK_TARGET_NOT_FOUND, então a mensagem aparece na folha', async () => {
    await setup({
      problem: {
        status: 422,
        code: 'NOTE_LINK_TARGET_NOT_FOUND',
        fieldErrors: [],
        traceId: null,
        retryAfterSeconds: null,
      },
    });

    expect(screen.getByTestId('picker-error')).toHaveTextContent(/não existe mais/);
  });

  it('Dado gravando, então não deixa vincular nem fechar', async () => {
    const { chosen, closed, settle } = await setup({ busy: true });
    await userEvent.type(screen.getByTestId('picker-search'), 'a');
    await settle();

    await userEvent.click(screen.getByTestId('picker-option-tx-1'));
    expect(screen.getByTestId('picker-cancel')).toBeDisabled();

    expect(chosen).toEqual([]);
    expect(closed).not.toHaveBeenCalled();
  });

  it('Dado a folha aberta com resultados, então o axe não aponta violações', async () => {
    const { settle } = await setup();
    await userEvent.type(screen.getByTestId('picker-search'), 'a');
    await settle();

    const violations = await axeViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
