import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { ConfirmDialogComponent } from '~/app/common/components/confirm-dialog/confirm-dialog.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({
  selector: 'app-dialog-host',
  imports: [ConfirmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" data-cy="trigger" (click)="open.set(true)">Estornar</button>
    <app-confirm-dialog
      [open]="open()"
      heading="Estornar movimentação?"
      description="O saldo volta ao que era antes."
      confirmLabel="Estornar"
      [requireReason]="true"
      (confirmed)="confirmed($event)"
      (cancelled)="open.set(false)"
    />
  `,
})
class DialogHostComponent {
  readonly open = signal(false);
  readonly confirmed = vi.fn();
}

async function setup() {
  const result = await render(DialogHostComponent, { providers: [provideI18nTesting('pt')] });
  const trigger = screen.getByTestId('trigger');
  await userEvent.click(trigger);
  await result.fixture.whenStable();
  return { ...result, trigger, host: result.fixture.componentInstance };
}

describe('ConfirmDialogComponent', () => {
  it('Dado que abre, então é um diálogo modal nomeado e o foco vai para o motivo', async () => {
    await setup();

    const dialog = screen.getByRole('dialog', { name: 'Estornar movimentação?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('O saldo volta ao que era antes.');
    expect(screen.getByTestId('confirm-dialog-reason')).toHaveFocus();
  });

  it('Dado o motivo em branco, então confirmar fica desabilitado; com motivo habilita e emite o texto limpo', async () => {
    const { host } = await setup();
    const confirm = screen.getByTestId('confirm-dialog-confirm');

    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByTestId('confirm-dialog-reason'), '   ');
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByTestId('confirm-dialog-reason'), ' lançado em duplicidade ');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    expect(host.confirmed).toHaveBeenCalledExactlyOnceWith('lançado em duplicidade');
  });

  it('Dado o foco, então fica preso no diálogo com Tab e Shift+Tab', async () => {
    await setup();
    const reason = screen.getByTestId('confirm-dialog-reason');
    const cancel = screen.getByTestId('confirm-dialog-cancel');
    await userEvent.type(reason, 'x');

    await userEvent.tab();
    expect(cancel).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveFocus();
    await userEvent.tab();
    expect(reason).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveFocus();
  });

  it('Dado Esc, então cancela, fecha e devolve o foco ao gatilho', async () => {
    const { trigger, host, fixture } = await setup();

    await userEvent.keyboard('{Escape}');
    await fixture.whenStable();

    expect(host.open()).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(host.confirmed).not.toHaveBeenCalled();
  });

  it('Dado o botão cancelar, então fecha e devolve o foco ao gatilho', async () => {
    const { trigger, fixture } = await setup();

    await userEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    await fixture.whenStable();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('Dado o diálogo aberto, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
