import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { RecurrenceFormPage } from '~/app/features/planning/pages/recurrence-form.page';
import type { Recurrence } from '~/modules/recurrences/core/types/recurrence';
import {
  AccountsGatewayStub,
  anAccount,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { aCard, CardsGatewayStub, provideCardsStub } from '~/testing/cards-testing';
import {
  aCategory,
  CategoriesGatewayStub,
  provideCategoriesStub,
} from '~/testing/categories-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  aRecurrence,
  provideRecurrencesStub,
  RecurrencesGatewayStub,
} from '~/testing/recurrences-testing';
import { todayIso } from '~/util/date';

vi.setConfig({ testTimeout: 30_000 });

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

async function setup({
  gateway = new RecurrencesGatewayStub(),
  id,
  accounts = [anAccount({ id: 'acc-1', name: 'Nubank' })],
  cards = [aCard({ id: 'card-1', name: 'Roxinho' })],
  accountsStub = new AccountsGatewayStub(),
}: {
  gateway?: RecurrencesGatewayStub;
  id?: string;
  accounts?: ReturnType<typeof anAccount>[];
  cards?: ReturnType<typeof aCard>[];
  accountsStub?: AccountsGatewayStub;
} = {}) {
  accountsStub.accounts = accounts;
  const cardsStub = new CardsGatewayStub();
  cardsStub.cards = cards;
  const categories = new CategoriesGatewayStub();
  categories.categories = [
    aCategory({ id: 'cat-home', name: 'Moradia' }),
    aCategory({ id: 'cat-salary', name: 'Salário', kind: 'INCOME' }),
  ];
  const result = await render(RecurrenceFormPage, {
    inputs: { id },
    providers: [
      provideI18nTesting('pt'),
      provideRecurrencesStub(gateway),
      provideAccountsStub(accountsStub),
      provideCardsStub(cardsStub),
      provideCategoriesStub(categories),
      provideRouter([{ path: 'planning/recurrences', component: DummyComponent }]),
    ],
  });
  await result.fixture.whenStable();
  return {
    ...result,
    gateway,
    accountsStub,
    toast: TestBed.inject(ToastService),
    router: TestBed.inject(Router),
  };
}

const field = (id: string) => screen.getByTestId(id) as HTMLInputElement;
const type = async (id: string, value: string) => {
  await userEvent.clear(field(id));
  await userEvent.type(field(id), value);
};
const pick = async (id: string, value: string) => {
  await userEvent.click(screen.getByTestId(id));
  await userEvent.click(screen.getByTestId(`${id}-option-${value}`));
};

async function fillBasic() {
  await type('recurrence-amount', '119,00');
  await type('recurrence-description', 'Internet');
  await pick('recurrence-category', 'cat-home');
  await pick('recurrence-account', 'acc-1');
  await pick('recurrence-method', 'BOLETO');
}

describe('RecurrenceFormPage', () => {
  describe('criar', () => {
    it('Dado o formulário novo, então pede tipo, valor, descrição, categoria, conta, método, frequência, início e fim', async () => {
      await setup();

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        pt.recurrences.form.createTitle,
      );
      for (const id of [
        'recurrence-type',
        'recurrence-amount',
        'recurrence-description',
        'recurrence-category',
        'recurrence-account',
        'recurrence-method',
        'recurrence-frequency',
        'recurrence-start',
        'recurrence-end-mode',
      ]) {
        expect(screen.getByTestId(id)).toBeInTheDocument();
      }
      expect(screen.queryByTestId('recurrence-interval')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recurrence-locked')).not.toBeInTheDocument();
    });

    it('Dado despesa mensal, quando salvo, então cria com os valores digitados, avisa e volta à lista', async () => {
      const { gateway, toast, router, fixture } = await setup();
      const navigate = vi.spyOn(router, 'navigate');

      await fillBasic();
      await userEvent.click(screen.getByTestId('recurrence-form-save'));
      await fixture.whenStable();

      expect(gateway.creates[0]).toEqual({
        type: 'EXPENSE',
        amount: '119.00',
        description: 'Internet',
        categoryId: 'cat-home',
        accountId: 'acc-1',
        method: 'BOLETO',
        cardId: null,
        frequency: 'MONTHLY',
        interval: null,
        unit: null,
        startDate: todayIso(),
        endDate: null,
        maxOccurrences: null,
      });
      expect(toast.toasts()[0]?.message).toBe(pt.recurrences.toast.created);
      expect(navigate).toHaveBeenCalledWith(['/planning/recurrences']);
    });

    it('Dado Receita, então só as categorias de receita aparecem', async () => {
      await setup();

      await userEvent.click(screen.getByTestId('recurrence-type-INCOME'));
      await userEvent.click(screen.getByTestId('recurrence-category'));

      expect(screen.getByTestId('recurrence-category-option-cat-salary')).toBeInTheDocument();
      expect(screen.queryByTestId('recurrence-category-option-cat-home')).not.toBeInTheDocument();
    });

    it('Dado Compra no cartão, então pede o cartão (à vista, sem parcelas) e não a conta nem o método', async () => {
      const { gateway, fixture } = await setup();

      await userEvent.click(screen.getByTestId('recurrence-type-CARD_PURCHASE'));
      expect(screen.queryByTestId('recurrence-account')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recurrence-method')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recurrence-installments')).not.toBeInTheDocument();
      await type('recurrence-amount', '50,00');
      await type('recurrence-description', 'Streaming');
      await pick('recurrence-category', 'cat-home');
      await pick('recurrence-card', 'card-1');
      await userEvent.click(screen.getByTestId('recurrence-form-save'));
      await fixture.whenStable();

      expect(screen.getByTestId('recurrence-card')).toHaveAccessibleDescription(
        pt.recurrences.form.cardNote,
      );
      expect(gateway.creates[0]).toMatchObject({
        type: 'CARD_PURCHASE',
        cardId: 'card-1',
        accountId: null,
        method: null,
      });
    });

    it('Dado frequência personalizada, então pede intervalo e unidade e os envia; nas outras, não', async () => {
      const { gateway, fixture } = await setup();

      await fillBasic();
      await pick('recurrence-frequency', 'CUSTOM');
      await type('recurrence-interval', '2');
      await pick('recurrence-unit', 'WEEKS');
      await userEvent.click(screen.getByTestId('recurrence-form-save'));
      await fixture.whenStable();

      expect(gateway.creates[0]).toMatchObject({ frequency: 'CUSTOM', interval: 2, unit: 'WEEKS' });
    });

    it('Dado o fim por data, então envia a data; por número, envia o máximo', async () => {
      const first = await setup();
      await fillBasic();
      await userEvent.click(screen.getByTestId('recurrence-end-mode-date'));
      await type('recurrence-end-date', '31/12/2027');
      await userEvent.click(screen.getByTestId('recurrence-form-save'));
      await first.fixture.whenStable();
      expect(first.gateway.creates[0]).toMatchObject({
        endDate: '2027-12-31',
        maxOccurrences: null,
      });
    });

    it('Dado o fim por número de ocorrências, então envia maxOccurrences e nenhuma data', async () => {
      const { gateway, fixture } = await setup();
      await fillBasic();

      await userEvent.click(screen.getByTestId('recurrence-end-mode-max'));
      await type('recurrence-max', '12');
      await userEvent.click(screen.getByTestId('recurrence-form-save'));
      await fixture.whenStable();

      expect(gateway.creates[0]).toMatchObject({ maxOccurrences: 12, endDate: null });
    });

    it('Dado campos vazios, então os erros são dos campos e nada é enviado', async () => {
      const { gateway } = await setup();

      await userEvent.click(screen.getByTestId('recurrence-form-save'));

      expect(gateway.creates).toHaveLength(0);
      expect(field('recurrence-amount')).toHaveAttribute('aria-invalid', 'true');
      expect(field('recurrence-description')).not.toHaveAttribute('aria-invalid', 'true');
    });

    it('Dado RECURRENCE_INVALID, então o aviso geral traduz o code e o digitado fica', async () => {
      const gateway = new RecurrencesGatewayStub();
      gateway.next = failWith(422, 'RECURRENCE_INVALID');
      await setup({ gateway });
      await fillBasic();

      await userEvent.click(screen.getByTestId('recurrence-form-save'));

      expect(screen.getByTestId('recurrence-form-error')).toHaveTextContent(
        pt.errors.codes['RECURRENCE_INVALID']!,
      );
      expect(field('recurrence-description').value).toBe('Internet');
    });

    it('Dado falha ao carregar as contas na criação, quando tento de novo, então o formulário aparece', async () => {
      const accountsStub = new AccountsGatewayStub();
      accountsStub.listError = failWith(0, 'NETWORK');
      const { fixture } = await setup({ accountsStub });
      expect(screen.getByTestId('empty-state-action-retry')).toBeInTheDocument();
      expect(screen.queryByTestId('recurrence-form')).not.toBeInTheDocument();

      accountsStub.listError = null;
      accountsStub.accounts = [anAccount({ id: 'acc-1', name: 'Nubank' })];
      await userEvent.click(screen.getByTestId('empty-state-action-retry'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(screen.getByTestId('recurrence-form')).toBeInTheDocument();
      expect(screen.queryByTestId('empty-state-action-retry')).not.toBeInTheDocument();
    });

    it('Dado falha de rede ao salvar, quando salvo o mesmo corpo de novo, então reusa a Idempotency-Key; corpo novo gera chave nova', async () => {
      const gateway = new RecurrencesGatewayStub();
      const { fixture } = await setup({ gateway });
      await fillBasic();
      gateway.next = failWith(0, 'NETWORK');
      await userEvent.click(screen.getByTestId('recurrence-form-save'));
      await userEvent.click(screen.getByTestId('recurrence-form-save'));
      await type('recurrence-description', 'Internet 2');
      await userEvent.click(screen.getByTestId('recurrence-form-save'));
      await fixture.whenStable();

      expect(gateway.createKeys).toHaveLength(3);
      expect(gateway.createKeys[1]).toBe(gateway.createKeys[0]);
      expect(gateway.createKeys[2]).not.toBe(gateway.createKeys[0]);
    });

    it('Dado o clique duplo, então uma requisição só', async () => {
      const gateway = new RecurrencesGatewayStub();
      gateway.next = (await import('rxjs')).NEVER as never;
      await setup({ gateway });
      await fillBasic();

      await userEvent.dblClick(screen.getByTestId('recurrence-form-save'));

      expect(gateway.creates).toHaveLength(1);
    });

    it('Dado nenhuma conta e nenhum cartão, então pede para cadastrar uma conta', async () => {
      await setup({ accounts: [], cards: [] });

      expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
        pt.recurrences.form.noAccounts.title,
      );
      expect(screen.getByTestId('empty-state-action-add-account')).toHaveAttribute(
        'href',
        '/accounts/new',
      );
    });
  });

  describe('editar', () => {
    const existing = (overrides: Partial<Recurrence> = {}) =>
      aRecurrence({
        id: 'rec-1',
        version: 4,
        endDate: null,
        frequency: 'MONTHLY',
        ...overrides,
      });

    it('Dado a edição, então tipo, frequência e início ficam desabilitados com a explicação "para mudar, encerre e crie outra"', async () => {
      const gateway = new RecurrencesGatewayStub();
      gateway.recurrences = [existing()];
      await setup({ gateway, id: 'rec-1' });

      expect(screen.getByTestId('recurrence-locked')).toHaveTextContent(pt.recurrences.form.locked);
      expect(screen.getByTestId('recurrence-frequency')).toHaveAttribute('aria-disabled', 'true');
      expect(field('recurrence-start')).toBeDisabled();
      expect(screen.queryByTestId('recurrence-end-mode')).not.toBeInTheDocument();
      expect(field('recurrence-amount').value).toBe('119,00');
      expect(field('recurrence-description').value).toBe('Internet');
    });

    it('Dado salvar, então o corpo só tem os dados do modelo e a version (sem frequência nem início)', async () => {
      const gateway = new RecurrencesGatewayStub();
      gateway.recurrences = [existing()];
      const { fixture } = await setup({ gateway, id: 'rec-1' });

      await type('recurrence-amount', '124,90');
      await userEvent.click(screen.getByTestId('recurrence-form-save'));
      await fixture.whenStable();

      expect(gateway.updates[0]).toEqual({
        amount: '124.90',
        description: 'Internet',
        categoryId: 'cat-1',
        accountId: 'acc-1',
        method: 'BOLETO',
        cardId: null,
        endDate: null,
        version: 4,
      });
      expect(gateway.updates[0]).not.toHaveProperty('frequency');
      expect(gateway.updates[0]).not.toHaveProperty('startDate');
    });

    it('Dado 409 VERSION_CONFLICT, então mostra o conflito e mantém o que o usuário digitou', async () => {
      const gateway = new RecurrencesGatewayStub();
      gateway.recurrences = [existing()];
      const { fixture } = await setup({ gateway, id: 'rec-1' });
      await type('recurrence-description', 'Internet fibra');
      gateway.next = failWith(409, 'VERSION_CONFLICT');

      await userEvent.click(screen.getByTestId('recurrence-form-save'));
      fixture.detectChanges();

      expect(screen.getByTestId('recurrence-form-conflict')).toHaveTextContent(
        pt.recurrences.form.conflict,
      );
      expect(field('recurrence-description').value).toBe('Internet fibra');
      expect(gateway.calls.filter((call) => call === 'get:rec-1')).toHaveLength(1);
    });

    it('Dado o conflito, quando escolho recarregar, então vem a versão atual e o aviso some', async () => {
      const gateway = new RecurrencesGatewayStub();
      gateway.recurrences = [existing()];
      const { fixture } = await setup({ gateway, id: 'rec-1' });
      await type('recurrence-description', 'Internet fibra');
      gateway.next = failWith(409, 'VERSION_CONFLICT');
      await userEvent.click(screen.getByTestId('recurrence-form-save'));
      gateway.recurrences = [existing({ description: 'Internet 500 mega', version: 9 })];

      await userEvent.click(screen.getByTestId('recurrence-form-reload'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(screen.queryByTestId('recurrence-form-conflict')).not.toBeInTheDocument();
      expect(field('recurrence-description').value).toBe('Internet 500 mega');
    });

    it('Dado recorrência encerrada, então explica como reabrir (fim de hoje em diante)', async () => {
      const gateway = new RecurrencesGatewayStub();
      gateway.recurrences = [existing({ ended: true, endDate: '2026-01-31' })];
      await setup({ gateway, id: 'rec-1' });

      expect(screen.getByTestId('recurrence-ended-hint')).toHaveTextContent(
        pt.recurrences.form.endedHint,
      );
    });

    it('Dado RECURRENCE_ENDED ao salvar sem fim, então o erro aparece no campo de fim, traduzido', async () => {
      const gateway = new RecurrencesGatewayStub();
      gateway.recurrences = [existing({ ended: true, endDate: '2026-01-31' })];
      const { fixture } = await setup({ gateway, id: 'rec-1' });
      gateway.next = failWith(422, 'RECURRENCE_ENDED');

      await userEvent.click(screen.getByTestId('recurrence-form-save'));
      fixture.detectChanges();

      expect(screen.getByTestId('recurrence-end-date')).toHaveAccessibleDescription(
        expect.stringContaining(pt.errors.codes['RECURRENCE_ENDED']!),
      );
    });

    it('Dado 404, então "recorrência não encontrada" com o caminho de volta', async () => {
      const gateway = new RecurrencesGatewayStub();
      gateway.getResult = failWith(404, 'RECURRENCE_NOT_FOUND');
      await setup({ gateway, id: 'x' });

      expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
        pt.recurrences.form.notFound.title,
      );
      expect(screen.getByTestId('empty-state-action-back')).toHaveAttribute(
        'href',
        '/planning/recurrences',
      );
    });

    it('Dado o fim opcional na edição, então envia a data escolhida', async () => {
      const gateway = new RecurrencesGatewayStub();
      gateway.recurrences = [existing()];
      const { fixture } = await setup({ gateway, id: 'rec-1' });

      await type('recurrence-end-date', '31/12/2027');
      await userEvent.click(screen.getByTestId('recurrence-form-save'));
      await fixture.whenStable();

      expect(gateway.updates[0]?.endDate).toBe('2027-12-31');
    });
  });

  it('Dado o formulário, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
