import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { AccountFormPage } from '~/app/features/accounts/pages/account-form.page';
import {
  AccountsGatewayStub,
  anAccount,
  brl,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({ selector: 'app-dummy', template: '' })
class DummyComponent {}

async function setup(gateway = new AccountsGatewayStub(), id?: string) {
  const result = await render(AccountFormPage, {
    inputs: { id },
    providers: [
      provideI18nTesting('pt'),
      provideAccountsStub(gateway),
      provideRouter([{ path: 'accounts', component: DummyComponent }]),
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

describe('AccountFormPage', () => {
  describe('criar', () => {
    it('Dado o formulário novo, então pede nome, tipo, instituição (opcional), saldo inicial (0,00) e data (hoje)', async () => {
      await setup();

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        pt.accounts.form.createTitle,
      );
      expect(input('account-name')).toBeInTheDocument();
      expect(screen.getByTestId('account-type')).toBeInTheDocument();
      expect(screen.getByTestId('account-institution')).toBeInTheDocument();
      expect(input('account-opening-balance').value).toBe('0,00');
      expect(input('account-opening-date').value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it('Dado os dados, quando salvo, então cria com os valores, mostra o toast e volta para a lista', async () => {
      const { gateway, toast, router, fixture } = await setup();

      await userEvent.type(input('account-name'), ' Nubank ');
      await userEvent.type(input('account-institution'), 'Nu Pagamentos');
      await userEvent.clear(input('account-opening-balance'));
      await userEvent.type(input('account-opening-balance'), '1.500,5');
      await userEvent.click(screen.getByTestId('account-form-save'));
      await fixture.whenStable();

      expect(gateway.calls).toEqual(['create:Nubank']);
      expect(toast.toasts()[0]?.message).toBe('Nubank adicionada.');
      expect(router.url).toBe('/accounts');
    });

    it('Dado o formulário limpo, quando cancelo, então volta para a lista sem pedir confirmação', async () => {
      const { router } = await setup();

      await userEvent.click(screen.getByTestId('account-form-cancel'));

      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
      expect(router.url).toBe('/accounts');
    });

    it('Dado um campo preenchido, quando cancelo, então pede para descartar e só volta ao confirmar', async () => {
      const { router, gateway } = await setup();

      await userEvent.type(input('account-name'), 'Nubank');
      await userEvent.click(screen.getByTestId('account-form-cancel'));

      expect(screen.getByTestId('confirm-dialog')).toHaveAccessibleName(pt.form.discard.title);
      await userEvent.click(screen.getByTestId('confirm-dialog-cancel'));
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
      expect(input('account-name').value).toBe('Nubank');

      await userEvent.click(screen.getByTestId('account-form-cancel'));
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      expect(router.url).toBe('/accounts');
      expect(gateway.calls).toEqual([]);
    });

    it('Dado o formulário aberto, então é um diálogo com o título como nome', async () => {
      await setup();

      expect(
        screen.getByRole('dialog', { name: pt.accounts.form.createTitle }),
      ).toBeInTheDocument();
    });

    it('Dado o nome vazio, quando salvo, então mostra o erro do campo e não chama a API', async () => {
      const { gateway, fixture } = await setup();

      await userEvent.click(screen.getByTestId('account-form-save'));
      fixture.detectChanges();

      expect(gateway.calls).toEqual([]);
      expect(input('account-name')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText(pt.form.errors.required)).toBeInTheDocument();
    });

    it('Dado 400 com erro no campo nome, então o erro aparece no campo e o digitado fica', async () => {
      const gateway = new AccountsGatewayStub();
      gateway.next = failWith(400, 'VALIDATION_FAILED', [
        { field: 'name', code: 'NOT_BLANK', message: 'x' },
      ]);
      const { fixture } = await setup(gateway);

      await userEvent.type(input('account-name'), 'Nubank');
      await userEvent.click(screen.getByTestId('account-form-save'));
      fixture.detectChanges();

      expect(input('account-name').value).toBe('Nubank');
      expect(screen.getByText(pt.errors.codes['NOT_BLANK']!)).toBeInTheDocument();
      expect(screen.queryByTestId('account-form-error')).not.toBeInTheDocument();
    });

    it('Dado um 422 sem campo, então mostra a mensagem do code num aviso', async () => {
      const gateway = new AccountsGatewayStub();
      gateway.next = failWith(500, 'INTERNAL_ERROR');
      await setup(gateway);

      await userEvent.type(input('account-name'), 'Nubank');
      await userEvent.click(screen.getByTestId('account-form-save'));

      expect(screen.getByTestId('account-form-error')).toHaveTextContent(
        pt.errors.codes['INTERNAL_ERROR']!,
      );
    });

    it('Dado o formulário, então o axe não aponta violações', async () => {
      const { container } = await setup();

      const violations = await axeViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });

  describe('editar', () => {
    it('Dado openingEditable: false, então tipo, saldo inicial e data ficam desabilitados com a explicação', async () => {
      const gateway = new AccountsGatewayStub();
      gateway.accounts = [
        anAccount({
          id: 'acc-1',
          openingEditable: false,
          openingBalance: brl('1000.00'),
          openingDate: '2026-01-01',
        }),
      ];
      await setup(gateway, 'acc-1');

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        pt.accounts.form.editTitle,
      );
      expect(input('account-name').value).toBe('Nubank');
      expect(input('account-opening-balance')).toBeDisabled();
      expect(input('account-opening-balance').value).toBe('1.000,00');
      expect(input('account-opening-date')).toBeDisabled();
      expect(screen.getByTestId('account-type')).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByTestId('account-opening-locked')).toHaveTextContent(
        pt.accounts.form.lockedHint,
      );
    });

    it('Dado a abertura travada, quando salvo, então o PUT leva a version e não envia a abertura', async () => {
      const gateway = new AccountsGatewayStub();
      gateway.accounts = [anAccount({ id: 'acc-1', openingEditable: false, version: 3 })];
      const { fixture, toast } = await setup(gateway, 'acc-1');

      await userEvent.clear(input('account-name'));
      await userEvent.type(input('account-name'), 'Nu');
      await userEvent.click(screen.getByTestId('account-form-save'));
      await fixture.whenStable();

      expect(gateway.calls).toContain('update:acc-1:3');
      expect(toast.toasts()[0]?.message).toBe(pt.accounts.toast.updated);
    });

    it('Dado openingEditable: true, então os campos de abertura ficam habilitados', async () => {
      const gateway = new AccountsGatewayStub();
      gateway.accounts = [anAccount({ id: 'acc-1', openingEditable: true })];
      await setup(gateway, 'acc-1');

      expect(input('account-opening-balance')).toBeEnabled();
      expect(input('account-opening-date')).toBeEnabled();
      expect(screen.queryByTestId('account-opening-locked')).not.toBeInTheDocument();
    });

    it('Dado 409 VERSION_CONFLICT, então avisa "mudou em outro lugar" e recarrega a conta', async () => {
      const gateway = new AccountsGatewayStub();
      gateway.accounts = [anAccount({ id: 'acc-1', openingEditable: false, version: 3 })];
      const { fixture } = await setup(gateway, 'acc-1');
      gateway.next = failWith(409, 'VERSION_CONFLICT');
      const before = gateway.calls.filter((c) => c.startsWith('get:')).length;

      await userEvent.click(screen.getByTestId('account-form-save'));
      fixture.detectChanges();

      expect(screen.getByTestId('account-form-conflict')).toHaveTextContent(
        pt.accounts.form.conflict,
      );
      expect(gateway.calls.filter((c) => c.startsWith('get:')).length).toBe(before + 1);
    });

    it('Dado conta inexistente (404), então mostra "não encontrada" com link para a lista', async () => {
      const gateway = new AccountsGatewayStub();
      gateway.getResult = failWith(404, 'ACCOUNT_NOT_FOUND');
      await setup(gateway, 'nada');

      expect(screen.getByTestId('empty-state-title')).toHaveTextContent(
        pt.accounts.form.notFound.title,
      );
      expect(screen.getByTestId('empty-state-action-back')).toHaveAttribute('href', '/accounts');
    });

    it('Dado erro ao carregar, então mostra o erro com "tentar de novo"', async () => {
      const gateway = new AccountsGatewayStub();
      gateway.getResult = failWith(500, 'INTERNAL_ERROR');
      await setup(gateway, 'acc-1');

      expect(screen.getByRole('alert')).toBeInTheDocument();
      gateway.getResult = null;
      await userEvent.click(screen.getByTestId('empty-state-action-retry'));

      expect(input('account-name').value).toBe('Nubank');
    });
  });
});
