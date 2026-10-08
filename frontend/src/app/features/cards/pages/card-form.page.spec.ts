import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { CardFormPage } from '~/app/features/cards/pages/card-form.page';
import {
  AccountsGatewayStub,
  anAccount,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aBillingPreview,
  aCard,
  CardsGatewayStub,
  provideCardsStub,
} from '~/testing/cards-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

async function setup(
  gateway = new CardsGatewayStub(),
  id?: string,
  accounts = new AccountsGatewayStub(),
) {
  const result = await render(CardFormPage, {
    inputs: { id },
    providers: [
      provideI18nTesting('pt'),
      provideCardsStub(gateway),
      provideAccountsStub(accounts),
      provideRouter([
        { path: 'cards', component: DummyComponent },
        { path: 'cards/:id', component: DummyComponent },
      ]),
    ],
  });
  return {
    ...result,
    gateway,
    toast: TestBed.inject(ToastService),
    router: TestBed.inject(Router),
  };
}

const input = (id: string) => screen.getByTestId(id) as HTMLInputElement;
const type = async (id: string, value: string) => {
  await userEvent.clear(input(id));
  await userEvent.type(input(id), value);
};

describe('CardFormPage', () => {
  describe('criar', () => {
    it('Dado o formulário novo, então pede nome, instituição, limite, dias e conta padrão; nunca número nem CVV', async () => {
      await setup();

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        pt.cards.form.createTitle,
      );
      for (const id of [
        'card-name',
        'card-institution',
        'card-limit',
        'card-closing-day',
        'card-due-day',
        'card-default-account',
      ]) {
        expect(screen.getByTestId(id)).toBeInTheDocument();
      }
      expect(document.querySelector('input[name*="number" i], input[name*="cvv" i]')).toBeNull();
      expect(screen.getByTestId('card-form-privacy')).toHaveTextContent(pt.cards.form.privacy);
      expect(screen.queryByTestId('billing-change')).not.toBeInTheDocument();
    });

    it('Dado os dados, quando salvo, então cria com os valores, mostra o toast e volta para a lista', async () => {
      const { gateway, toast, router, fixture } = await setup();

      await type('card-name', ' Roxinho ');
      await type('card-limit', '10.000,00');
      await type('card-closing-day', '25');
      await type('card-due-day', '5');
      await userEvent.click(screen.getByTestId('card-form-save'));
      await fixture.whenStable();

      expect(gateway.calls).toEqual(['create:Roxinho']);
      expect(toast.toasts()[0]?.message).toBe('Cartão Roxinho adicionado.');
      expect(router.url).toBe('/cards');
    });

    it('Dado campos vazios, quando salvo, então mostra os erros de UX e não chama a API', async () => {
      const { gateway, fixture } = await setup();

      await userEvent.click(screen.getByTestId('card-form-save'));
      fixture.detectChanges();

      expect(gateway.calls).toEqual([]);
      expect(input('card-name')).toHaveAttribute('aria-invalid', 'true');
      expect(input('card-closing-day')).toHaveAttribute('aria-invalid', 'true');
    });

    it('Dado limite zero, então o erro é "maior que zero" (regra do backend, UX no front)', async () => {
      const { gateway, fixture } = await setup();
      await type('card-name', 'Roxinho');
      await type('card-limit', '0');
      await type('card-closing-day', '25');
      await type('card-due-day', '5');

      await userEvent.click(screen.getByTestId('card-form-save'));
      fixture.detectChanges();

      expect(gateway.calls).toEqual([]);
      expect(screen.getByText(pt.form.errors.moneyZero)).toBeInTheDocument();
    });

    it('Dado 422 CARD_INVALID_LIMIT do backend, então o erro vai ao campo do limite e o digitado fica', async () => {
      const gateway = new CardsGatewayStub();
      gateway.next = failWith(422, 'CARD_INVALID_LIMIT');
      const { fixture } = await setup(gateway);
      await type('card-name', 'Roxinho');
      await type('card-limit', '5,00');
      await type('card-closing-day', '25');
      await type('card-due-day', '5');

      await userEvent.click(screen.getByTestId('card-form-save'));
      fixture.detectChanges();

      expect(input('card-name').value).toBe('Roxinho');
      expect(screen.getByText(pt.errors.codes['CARD_INVALID_LIMIT']!)).toBeInTheDocument();
      expect(screen.queryByTestId('card-form-error')).not.toBeInTheDocument();
    });

    it('Dado um erro sem campo, então mostra a mensagem do code num aviso', async () => {
      const gateway = new CardsGatewayStub();
      gateway.next = failWith(500, 'INTERNAL_ERROR');
      await setup(gateway);
      await type('card-name', 'Roxinho');
      await type('card-limit', '5,00');
      await type('card-closing-day', '25');
      await type('card-due-day', '5');

      await userEvent.click(screen.getByTestId('card-form-save'));

      expect(screen.getByTestId('card-form-error')).toHaveTextContent(
        pt.errors.codes['INTERNAL_ERROR']!,
      );
    });

    it('Dado contas CASH, então o campo de conta padrão as oferece (investimento não); sem conta, o campo continua opcional', async () => {
      const accounts = new AccountsGatewayStub();
      accounts.accounts = [
        anAccount({ id: 'acc-1', name: 'Nubank' }),
        anAccount({
          id: 'acc-inv',
          name: 'Corretora',
          type: 'INVESTMENT',
          liquidity: 'INVESTMENT',
        }),
      ];
      await setup(new CardsGatewayStub(), undefined, accounts);

      await userEvent.click(screen.getByTestId('card-default-account'));
      expect(screen.getByTestId('card-default-account-option-acc-1')).toBeInTheDocument();
      expect(screen.queryByTestId('card-default-account-option-acc-inv')).not.toBeInTheDocument();
    });

    it('Dado o limite em branco, então o cartão é criado sem limite (definir depois)', async () => {
      const { gateway, fixture } = await setup();
      expect(screen.getByText(pt.cards.form.limitHint)).toBeInTheDocument();
      await type('card-name', 'Azul');
      await type('card-closing-day', '10');
      await type('card-due-day', '17');

      await userEvent.click(screen.getByTestId('card-form-save'));
      await fixture.whenStable();

      expect(gateway.creates).toHaveLength(1);
      expect(gateway.creates[0]!.limit).toBeNull();
    });

    it('Dado nenhuma conta cadastrada, então explica que dá para escolher depois e salva sem conta padrão', async () => {
      const { gateway, fixture } = await setup();
      expect(screen.getByText(pt.cards.form.noAccounts)).toBeInTheDocument();
      await type('card-name', 'Roxinho');
      await type('card-limit', '5,00');
      await type('card-closing-day', '25');
      await type('card-due-day', '5');

      await userEvent.click(screen.getByTestId('card-form-save'));
      await fixture.whenStable();

      expect(gateway.calls).toEqual(['create:Roxinho']);
    });

    it('Dado o formulário, então o axe não aponta violações', async () => {
      const { container } = await setup();

      const violations = await axeViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });

  describe('editar', () => {
    it('Dado o cartão, então preenche o formulário e não pede nenhuma prévia (nenhum dia mudou)', async () => {
      const gateway = new CardsGatewayStub();
      gateway.cards = [aCard({ id: 'card-1', name: 'Roxinho', closingDay: 25, dueDay: 5 })];
      await setup(gateway, 'card-1');

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(pt.cards.form.editTitle);
      expect(input('card-name').value).toBe('Roxinho');
      expect(input('card-limit').value).toBe('10.000,00');
      expect(input('card-closing-day').value).toBe('25');
      expect(input('card-due-day').value).toBe('5');
      expect(gateway.billingPreviewCalls).toEqual([]);
      expect(screen.queryByTestId('billing-change')).not.toBeInTheDocument();
    });

    it('Dado mudar só o nome, então salva com a version e sem confirmedEffectiveFrom', async () => {
      const gateway = new CardsGatewayStub();
      gateway.cards = [aCard({ id: 'card-1', version: 7 })];
      const { fixture } = await setup(gateway, 'card-1');

      await type('card-name', 'Roxo');
      await userEvent.click(screen.getByTestId('card-form-save'));
      await fixture.whenStable();

      expect(gateway.updates[0]).toMatchObject({
        name: 'Roxo',
        version: 7,
        confirmedEffectiveFrom: null,
      });
      expect(gateway.billingPreviewCalls).toEqual([]);
    });

    describe('mudança de fechamento (T69)', () => {
      beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
      afterEach(() => vi.useRealTimers());

      it('Dado fechamento 25 → 10, então pede a prévia (300 ms), mostra o efeito como recebido e só então habilita salvar', async () => {
        const gateway = new CardsGatewayStub();
        gateway.cards = [aCard({ id: 'card-1', closingDay: 25, dueDay: 5, version: 3 })];
        // Valores de propósito diferentes dos "óbvios": a tela mostra o que veio.
        gateway.billingPreview$ = of(
          aBillingPreview({
            effectiveFromClosingDate: '2026-11-25',
            firstNewInvoice: { closingDate: '2026-11-10', dueDate: '2026-11-20' },
            movedInstallments: 7,
            movedCredits: 2,
          }),
        );
        const { fixture } = await setup(gateway, 'card-1');

        await type('card-closing-day', '10');
        expect(screen.getByTestId('billing-change-loading')).toBeInTheDocument();
        expect(screen.getByTestId('card-form-save')).toBeDisabled();
        expect(gateway.billingPreviewCalls).toEqual([]);
        await vi.advanceTimersByTimeAsync(300);
        fixture.detectChanges();

        expect(gateway.billingPreviewCalls).toEqual([
          { cardId: 'card-1', closingDay: 10, dueDay: 5 },
        ]);
        expect(screen.getByTestId('billing-change-first-invoice')).toHaveTextContent(
          'Vale a partir da fatura que fecha em 10 de nov. e vence em 20 de nov.',
        );
        expect(screen.getByTestId('billing-change-keep')).toHaveTextContent(
          'A fatura atual e as fechadas não mudam.',
        );
        expect(screen.getByTestId('billing-change-moved')).toHaveTextContent(
          'Parcelas que mudam de fatura: 7. Créditos que mudam: 2.',
        );
        expect(screen.getByTestId('card-form-save')).toBeEnabled();

        await userEvent.click(screen.getByTestId('card-form-save'));
        expect(gateway.updates[0]).toMatchObject({
          closingDay: 10,
          dueDay: 5,
          version: 3,
          confirmedEffectiveFrom: '2026-11-25',
        });
      });

      it('Dado a prévia que nunca chega, então o salvar fica desabilitado com o aviso de espera', async () => {
        const gateway = new CardsGatewayStub();
        gateway.cards = [aCard({ id: 'card-1', closingDay: 25, dueDay: 5 })];
        gateway.billingPreview$ = NEVER;
        const { fixture } = await setup(gateway, 'card-1');

        await type('card-due-day', '20');
        await vi.advanceTimersByTimeAsync(300);
        fixture.detectChanges();

        expect(screen.getByTestId('card-form-save')).toBeDisabled();
      });

      it('Dado voltar ao dia original, então a prévia some e o salvar volta a habilitar', async () => {
        const gateway = new CardsGatewayStub();
        gateway.cards = [aCard({ id: 'card-1', closingDay: 25, dueDay: 5 })];
        gateway.billingPreview$ = NEVER;
        const { fixture } = await setup(gateway, 'card-1');
        await type('card-closing-day', '10');

        await type('card-closing-day', '25');
        fixture.detectChanges();

        expect(screen.queryByTestId('billing-change')).not.toBeInTheDocument();
        expect(screen.getByTestId('card-form-save')).toBeEnabled();
      });

      it('Dado erro na prévia, então "tentar de novo" pede a prévia outra vez e libera o salvar', async () => {
        const gateway = new CardsGatewayStub();
        gateway.cards = [aCard({ id: 'card-1', closingDay: 25, dueDay: 5 })];
        gateway.billingPreview$ = failWith(500, 'INTERNAL_ERROR');
        const { fixture } = await setup(gateway, 'card-1');
        await type('card-closing-day', '10');
        await vi.advanceTimersByTimeAsync(300);
        fixture.detectChanges();
        expect(screen.getByTestId('billing-change-error')).toBeInTheDocument();
        gateway.billingPreview$ = null;

        await userEvent.click(screen.getByTestId('billing-change-retry'));
        await vi.advanceTimersByTimeAsync(300);
        fixture.detectChanges();

        expect(gateway.billingPreviewCalls).toHaveLength(2);
        expect(screen.queryByTestId('billing-change-error')).not.toBeInTheDocument();
        expect(screen.getByTestId('billing-change-first-invoice')).toBeInTheDocument();
        expect(screen.getByTestId('card-form-save')).toBeEnabled();
      });

      it('Dado 409 CARD_BILLING_CHANGE_STALE, então refaz a prévia, avisa e exige confirmar de novo', async () => {
        const gateway = new CardsGatewayStub();
        gateway.cards = [aCard({ id: 'card-1', closingDay: 25, dueDay: 5 })];
        const { fixture } = await setup(gateway, 'card-1');
        await type('card-closing-day', '10');
        await vi.advanceTimersByTimeAsync(300);
        fixture.detectChanges();
        gateway.next = failWith(409, 'CARD_BILLING_CHANGE_STALE');

        await userEvent.click(screen.getByTestId('card-form-save'));
        fixture.detectChanges();

        expect(screen.getByTestId('billing-change-stale')).toHaveTextContent(
          pt.cards.billingChange.stale,
        );
        expect(screen.queryByTestId('card-form-error')).not.toBeInTheDocument();
        await vi.advanceTimersByTimeAsync(300);
        expect(gateway.billingPreviewCalls).toHaveLength(2);
      });

      it('Dado 409 VERSION_CONFLICT, então avisa "mudou em outro lugar" e recarrega o cartão', async () => {
        const gateway = new CardsGatewayStub();
        gateway.cards = [aCard({ id: 'card-1', version: 3 })];
        const { fixture } = await setup(gateway, 'card-1');
        gateway.next = failWith(409, 'VERSION_CONFLICT');
        gateway.cards = [aCard({ id: 'card-1', version: 4, name: 'Roxo novo' })];

        await userEvent.click(screen.getByTestId('card-form-save'));
        fixture.detectChanges();

        expect(screen.getByTestId('card-form-conflict')).toHaveTextContent(pt.cards.form.conflict);
        expect(gateway.calls.filter((c) => c === 'get:card-1')).toHaveLength(2);
        expect(input('card-name').value).toBe('Roxo novo');
      });
    });

    it('Dado cartão de outro usuário ou inexistente (404), então "não encontrado" com voltar', async () => {
      const gateway = new CardsGatewayStub();
      gateway.getResult = failWith(404, 'CARD_NOT_FOUND');
      await setup(gateway, 'x');

      expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
        pt.cards.form.notFound.title,
      );
      expect(screen.getByTestId('empty-state-action-back')).toHaveAttribute('href', '/cards');
    });

    it('Dado erro de rede ao carregar, então mostra o erro com "tentar de novo"', async () => {
      const gateway = new CardsGatewayStub();
      gateway.getResult = failWith(0, 'NETWORK');
      await setup(gateway, 'x');

      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });
  });
});
