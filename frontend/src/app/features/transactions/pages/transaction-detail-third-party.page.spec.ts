import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { TransactionDetailPage } from '~/app/features/transactions/pages/transaction-detail.page';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideNotesStub } from '~/testing/notes-testing';
import { aPerson, PeopleGatewayStub, providePeopleStub } from '~/testing/people-testing';
import {
  aReceivables,
  anEmptyReceivables,
  provideThirdPartiesStub,
  ThirdPartiesGatewayStub,
} from '~/testing/third-parties-testing';
import {
  aTransaction,
  provideTransactionsStub,
  TransactionsGatewayStub,
} from '~/testing/transactions-testing';

vi.setConfig({ testTimeout: 30_000 });

const pick = async (id: string, value: string) => {
  await userEvent.click(screen.getByTestId(id));
  await userEvent.click(screen.getByTestId(`${id}-option-${value}`));
};

async function setup(options: {
  transaction?: ReturnType<typeof aTransaction>;
  receivables?: ReturnType<typeof aReceivables>;
}) {
  const transactions = new TransactionsGatewayStub();
  transactions.get$ = of(options.transaction ?? aTransaction({ id: 'tx-tp-1' }));
  const thirdParties = new ThirdPartiesGatewayStub();
  thirdParties.receivables$ = of(options.receivables ?? anEmptyReceivables());
  const people = new PeopleGatewayStub();
  people.people = [aPerson({ id: 'person-1', name: 'Ana' })];
  const result = await render(TransactionDetailPage, {
    inputs: { id: options.transaction?.id ?? 'tx-tp-1' },
    providers: [
      provideI18nTesting('pt'),
      provideRouter([]),
      provideNotesStub(),
      provideTransactionsStub(transactions),
      provideThirdPartiesStub(thirdParties),
      providePeopleStub(people),
    ],
  });
  await result.fixture.whenStable();
  return { ...result, thirdParties, people, toast: TestBed.inject(ToastService) };
}

describe('TransactionDetailPage: despesa de terceiro', () => {
  it('Dado uma despesa marcada, então mostra o selo com texto e ícone, a pessoa e o reembolso do servidor', async () => {
    await setup({ receivables: aReceivables() });

    const badge = await screen.findByTestId('third-party-badge');
    expect(badge).toHaveTextContent('De terceiro: Ana');
    expect(badge.querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('detail-third-person')).toHaveTextContent('Ana');
    expect(screen.getByTestId('detail-third-owed')).toHaveTextContent('R$ 300,00');
    expect(screen.getByTestId('detail-third-received')).toHaveTextContent('R$ 100,00');
    expect(screen.getByTestId('detail-third-pending')).toHaveTextContent('R$ 200,00');
    expect(screen.queryByTestId('detail-third-mark')).not.toBeInTheDocument();
  });

  it('Dado uma despesa marcada, então o reembolso usa o fluxo de reembolso, nunca renda', async () => {
    await setup({ receivables: aReceivables() });

    const link = await screen.findByTestId('detail-third-refund');
    expect(link.getAttribute('href')).toContain('mode=refund');
    expect(link.getAttribute('href')).not.toContain('mode=income');
    expect(screen.getByTestId('detail-third-party')).toHaveTextContent(
      pt.transactions.thirdParty.detail.rule,
    );
  });

  it('Dado uma despesa sem marca, então oferece "Marcar como despesa de terceiro"', async () => {
    await setup({});

    expect(await screen.findByTestId('detail-third-mark')).toHaveTextContent(
      pt.transactions.thirdParty.action,
    );
    expect(screen.queryByTestId('third-party-badge')).not.toBeInTheDocument();
  });

  it('Dado marcar com a pessoa escolhida, então manda a marca, avisa e relê o vínculo do backend', async () => {
    const { thirdParties, toast, fixture } = await setup({});
    await userEvent.click(await screen.findByTestId('detail-third-mark'));
    thirdParties.receivables$ = of(aReceivables());

    await pick('tp-person', 'person-1');
    await userEvent.click(screen.getByTestId('tp-save'));
    await fixture.whenStable();

    await waitFor(() => expect(thirdParties.marks).toHaveLength(1));
    expect(thirdParties.marks[0]!.input).toEqual({
      transactionId: 'tx-tp-1',
      personId: 'person-1',
      note: '',
    });
    expect(toast.toasts()[0]?.message).toBe(pt.transactions.thirdParty.modal.toast);
    expect(await screen.findByTestId('third-party-badge')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Dado a pessoa que ainda não existe, então cria na hora e marca com a pessoa criada', async () => {
    const { thirdParties, people } = await setup({});
    await userEvent.click(await screen.findByTestId('detail-third-mark'));

    await pick('tp-person', '__new-person__');
    await userEvent.type(screen.getByTestId('tp-person-new-name'), 'Beto');
    await userEvent.click(screen.getByTestId('tp-person-new-create'));
    await waitFor(() => expect(people.creates).toHaveLength(1));
    await userEvent.click(screen.getByTestId('tp-save'));

    await waitFor(() => expect(thirdParties.marks).toHaveLength(1));
    expect(people.creates[0]!.name).toBe('Beto');
    expect(thirdParties.marks[0]!.input.personId).toBe('person-new');
  });

  it('Dado sem escolher a pessoa, então não envia e mostra o campo obrigatório', async () => {
    const { thirdParties } = await setup({});
    await userEvent.click(await screen.findByTestId('detail-third-mark'));

    await userEvent.click(screen.getByTestId('tp-save'));

    expect(thirdParties.marks).toHaveLength(0);
    expect(screen.getByTestId('tp-person')).toHaveAttribute('aria-invalid', 'true');
  });

  it('Dado uma movimentação que não é despesa nem compra no cartão, então não oferece a marca', async () => {
    await setup({ transaction: aTransaction({ id: 'tx-in', type: 'INCOME' }) });

    expect(await screen.findByTestId('detail-title')).toBeInTheDocument();
    expect(screen.queryByTestId('detail-third-mark')).not.toBeInTheDocument();
  });

  it('Dado o modal aberto, então não tem violações de acessibilidade', async () => {
    const { container } = await setup({});
    await userEvent.click(await screen.findByTestId('detail-third-mark'));

    const violations = await axeViolations(container.ownerDocument.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
