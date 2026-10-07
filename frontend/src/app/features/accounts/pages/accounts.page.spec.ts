import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ToastService } from '~/app/common/services/toast.service';
import { AccountsPage } from '~/app/features/accounts/pages/accounts.page';
import {
  AccountsGatewayStub,
  anAccount,
  brl,
  failWith,
  provideAccountsStub,
} from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

const text = (el: HTMLElement) => el.textContent?.replace(/\u00a0/g, ' ').trim();

async function setup(gateway = new AccountsGatewayStub(), inputs: { status?: string } = {}) {
  const result = await render(AccountsPage, {
    inputs,
    providers: [provideI18nTesting('pt'), provideRouter([]), provideAccountsStub(gateway)],
  });
  return { ...result, gateway, toast: TestBed.inject(ToastService) };
}

describe('AccountsPage', () => {
  it('Dado nenhuma conta, então o estado vazio mostra "Adicionar conta" habilitado, levando a /accounts/new', async () => {
    await setup();

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.emptyState.accounts.title);
    const action = screen.getByTestId('empty-state-action-add-account');
    expect(action).toHaveAttribute('href', '/accounts/new');
    expect(action).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('accounts-add')).toHaveAttribute('href', '/accounts/new');
  });

  it('Dado conta com reserva descoberta (uncovered), então avisa em texto, sem bloquear nada', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [
      anAccount({ id: 'a', name: 'Nubank', uncovered: true, reservedAmount: brl('25000.00') }),
      anAccount({ id: 'b', name: 'Cofre' }),
    ];
    await setup(gateway);

    expect(screen.getByTestId('account-uncovered-a')).toHaveTextContent(pt.accounts.uncovered);
    expect(screen.queryByTestId('account-uncovered-b')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-edit-a')).toBeInTheDocument();
  });

  it('Dado contas, então a lista mostra nome, tipo, instituição e o saldo atual que a API devolveu', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [
      anAccount({
        id: 'a',
        name: 'Nubank',
        type: 'CHECKING',
        institution: 'Nu Pagamentos',
        // Diferente do inicial de propósito: o front exibe o saldo recebido, sem recalcular.
        currentBalance: brl('1234.56'),
      }),
      anAccount({
        id: 'b',
        name: 'Cofre',
        type: 'WALLET',
        institution: null,
        currentBalance: brl('-80.00'),
      }),
    ];
    await setup(gateway);

    const first = screen.getByTestId('account-row-a');
    expect(within(first).getByText('Nubank')).toBeInTheDocument();
    expect(first).toHaveTextContent(pt.accounts.types.CHECKING);
    expect(text(screen.getByTestId('account-institution-a'))).toBe('Nu Pagamentos');
    expect(text(screen.getByTestId('account-balance-a'))).toBe('R$ 1.234,56');
    expect(screen.getByTestId('account-balance-a').querySelector('.num')).not.toBeNull();
    expect(screen.getByTestId('account-row-b')).toHaveTextContent(pt.accounts.types.WALLET);
  });

  it('Dado saldo negativo, então aparece na cor de risco, com texto, e a conta continua utilizável', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [anAccount({ id: 'b', currentBalance: brl('-80.00') })];
    await setup(gateway);

    expect(text(screen.getByTestId('account-balance-b'))).toContain('−R$ 80,00');
    expect(screen.getByTestId('account-balance-b')).toHaveClass('is-negative');
    expect(screen.getByTestId('account-row-b')).toHaveTextContent(pt.accounts.negativeBalance);
  });

  it('Dado o filtro na URL (?status=ARCHIVED), então lista só as arquivadas, com "Desarquivar"', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [
      anAccount({ id: 'a' }),
      anAccount({ id: 'z', name: 'Velha', status: 'ARCHIVED' }),
    ];
    await setup(gateway, { status: 'ARCHIVED' });

    expect(gateway.queries[0]).toMatchObject({ status: 'ARCHIVED', pageSize: 50 });
    expect(screen.queryByTestId('account-row-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-unarchive-z')).toHaveTextContent(pt.accounts.unarchive);
    expect(screen.getByTestId('accounts-tab-archived')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('accounts-tab-active')).not.toHaveAttribute('aria-current');
  });

  it('Dado nenhuma arquivada, então mostra a nota em vez do estado vazio de cadastro', async () => {
    await setup(new AccountsGatewayStub(), { status: 'ARCHIVED' });

    expect(screen.getByTestId('accounts-empty-archived')).toHaveTextContent(
      pt.accounts.emptyArchived,
    );
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  it('Dado a carga pendente, então mostra o status de carregando', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.listError = NEVER as never;
    await setup(gateway);

    expect(screen.getByTestId('accounts-loading')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(pt.accounts.loading);
  });

  it('Dado erro, então mostra "tentar de novo", que recarrega e mostra as contas', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.listError = failWith(500, 'INTERNAL_ERROR');
    await setup(gateway);

    expect(screen.getByRole('alert')).toHaveTextContent(pt.errors.load.title);
    gateway.listError = null;
    gateway.accounts = [anAccount({ id: 'a' })];
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(screen.getByTestId('account-row-a')).toBeInTheDocument();
  });

  it('Dado archivable: false, então "Arquivar" fica desabilitado com a dica "saldo zero"', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [anAccount({ id: 'a', archivable: false })];
    await setup(gateway);

    const button = screen.getByTestId('account-archive-a');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('account-archive-hint-a')).toHaveTextContent(pt.accounts.archiveHint);
    expect(button.getAttribute('aria-describedby')).toBe(
      screen.getByTestId('account-archive-hint-a').id,
    );
  });

  it('Dado archivable: true, quando arquivo e confirmo, então chama a API e a conta vai para "Arquivadas"', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [
      anAccount({ id: 'a', name: 'Nubank', archivable: true }),
      anAccount({ id: 'b', name: 'Itaú', archivable: false }),
    ];
    const { toast } = await setup(gateway);

    await userEvent.click(screen.getByTestId('account-archive-a'));
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent('Arquivar Nubank?');
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(gateway.calls).toContain('archive:a');
    expect(screen.queryByTestId('account-row-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-row-b')).toBeInTheDocument();
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    expect(toast.toasts()[0]?.message).toBe(pt.accounts.toast.archived);
  });

  it('Dado o diálogo de arquivar, quando cancelo, então nada é chamado', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [anAccount({ id: 'a', archivable: true })];
    await setup(gateway);

    await userEvent.click(screen.getByTestId('account-archive-a'));
    await userEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(gateway.calls).not.toContain('archive:a');
    expect(screen.getByTestId('account-row-a')).toBeInTheDocument();
  });

  it('Dado 422 ACCOUNT_WITH_BALANCE_CANNOT_BE_ARCHIVED, então avisa pelo code e mantém a conta', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [anAccount({ id: 'a', archivable: true })];
    gateway.next = failWith(422, 'ACCOUNT_WITH_BALANCE_CANNOT_BE_ARCHIVED');
    const { toast } = await setup(gateway);

    await userEvent.click(screen.getByTestId('account-archive-a'));
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(toast.toasts()[0]).toMatchObject({
      tone: 'error',
      message: pt.errors.codes['ACCOUNT_WITH_BALANCE_CANNOT_BE_ARCHIVED'],
    });
    expect(screen.getByTestId('account-row-a')).toBeInTheDocument();
  });

  it('Dado 422 ACCOUNT_HAS_RESERVATIONS, então mostra o aviso traduzido com atalho para as metas', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [anAccount({ id: 'a', archivable: true })];
    gateway.next = failWith(422, 'ACCOUNT_HAS_RESERVATIONS');
    const { toast } = await setup(gateway);

    await userEvent.click(screen.getByTestId('account-archive-a'));
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(screen.getByTestId('accounts-reservations-blocked')).toHaveTextContent(
      pt.errors.codes['ACCOUNT_HAS_RESERVATIONS'] ?? '',
    );
    expect(screen.getByTestId('accounts-reservations-goals')).toHaveAttribute('href', '/goals');
    expect(toast.toasts()).toHaveLength(0);
    expect(screen.getByTestId('account-row-a')).toBeInTheDocument();
  });

  it('Dado uma arquivada, quando desarquivo, então chama a API e ela sai da aba', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [anAccount({ id: 'z', status: 'ARCHIVED' })];
    const { toast } = await setup(gateway, { status: 'ARCHIVED' });

    await userEvent.click(screen.getByTestId('account-unarchive-z'));

    expect(gateway.calls).toContain('unarchive:z');
    expect(screen.queryByTestId('account-row-z')).not.toBeInTheDocument();
    expect(toast.toasts()[0]?.message).toBe(pt.accounts.toast.unarchived);
  });

  it('Dado a lista, então o axe não aponta violações', async () => {
    const gateway = new AccountsGatewayStub();
    gateway.accounts = [anAccount({ id: 'a', archivable: true }), anAccount({ id: 'b' })];
    const { container } = await setup(gateway);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
