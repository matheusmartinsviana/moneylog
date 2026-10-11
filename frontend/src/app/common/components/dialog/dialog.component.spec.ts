import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { DialogComponent } from '~/app/common/components/dialog/dialog.component';
import type { ModalRole } from '~/app/common/components/overlay/overlay-panel.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({
  selector: 'app-dialog-host',
  imports: [DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main data-cy="page">
      <button type="button" data-cy="trigger" (click)="open.set(true)">Abrir</button>
      <app-dialog
        heading="Nova parcela"
        description="Escolha como dividir."
        [open]="open()"
        [dialogRole]="role()"
        [dismissable]="dismissable()"
        (closed)="onClosed()"
      >
        <label for="name">Nome</label>
        <input id="name" class="input" type="text" data-cy="name" data-autofocus />
        <button type="button" data-cy="ok">Salvar</button>
      </app-dialog>
    </main>
  `,
})
class DialogHostComponent {
  readonly open = signal(false);
  readonly role = signal<ModalRole>('dialog');
  readonly dismissable = signal(true);
  readonly closed = vi.fn();
  onClosed(): void {
    this.closed();
    this.open.set(false);
  }
}

async function setup() {
  const result = await render(DialogHostComponent, { providers: [provideI18nTesting('pt')] });
  const host = result.fixture.componentInstance;
  const trigger = screen.getByTestId('trigger');
  await userEvent.click(trigger);
  await result.fixture.whenStable();
  return { ...result, host, trigger };
}

describe('DialogComponent', () => {
  afterEach(() => {
    document.body.removeAttribute('style');
    vi.unstubAllGlobals();
  });

  it('Dado que abre, então é um diálogo modal nomeado e descrito, e o foco vai para o autofoco', async () => {
    await setup();

    const dialog = screen.getByRole('dialog', { name: 'Nova parcela' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Escolha como dividir.');
    expect(screen.getByRole('heading', { name: 'Nova parcela' })).toBeInTheDocument();
    expect(screen.getByTestId('name')).toHaveFocus();
  });

  it('Dado aberto, então o fundo fica inert e a rolagem do body travada; ao fechar, solta tudo', async () => {
    const { fixture, host } = await setup();

    expect(screen.getByTestId('page').closest('[inert]')).not.toBeNull();
    expect(document.body.style.position).toBe('fixed');

    host.open.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(screen.getByTestId('page').closest('[inert]')).toBeNull();
    expect(document.body.style.position).toBe('');
  });

  it('Dado o foco, então Tab e Shift+Tab ficam presos no diálogo', async () => {
    await setup();
    const close = screen.getByTestId('dialog-close');
    const name = screen.getByTestId('name');
    const ok = screen.getByTestId('ok');

    expect(name).toHaveFocus();
    await userEvent.tab();
    expect(ok).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab();
    expect(name).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(ok).toHaveFocus();
  });

  it('Dado Esc, então pede o fechamento e o foco volta ao gatilho', async () => {
    const { host, trigger, fixture } = await setup();

    await userEvent.keyboard('{Escape}');
    fixture.detectChanges();

    expect(host.closed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(trigger).toHaveFocus());
  });

  it('Dado o toque no fundo e o botão Fechar, então ambos pedem o fechamento', async () => {
    const { host, fixture } = await setup();

    await userEvent.click(screen.getByTestId('dialog-backdrop'));
    expect(host.closed).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId('trigger'));
    fixture.detectChanges();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(host.closed).toHaveBeenCalledTimes(2);
  });

  it('Dado que o toque é dentro do diálogo, então não fecha', async () => {
    const { host } = await setup();

    await userEvent.click(screen.getByRole('dialog'));
    await userEvent.click(screen.getByTestId('ok'));

    expect(host.closed).not.toHaveBeenCalled();
  });

  it('Dado dismissable=false, então Esc e fundo são ignorados e não há botão Fechar', async () => {
    const { host, fixture } = await setup();
    host.dismissable.set(false);
    fixture.detectChanges();

    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByTestId('dialog-backdrop'));

    expect(host.closed).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Fechar' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Dado role=alertdialog, então o painel usa o papel alertdialog', async () => {
    const { host, fixture } = await setup();
    host.role.set('alertdialog');
    fixture.detectChanges();

    expect(screen.getByRole('alertdialog', { name: 'Nova parcela' })).toBeInTheDocument();
  });

  it('Dado tela larga, então é um diálogo central (também na compacta)', async () => {
    await setup();
    expect(screen.getByTestId('dialog-panel')).toHaveAttribute('data-side', 'center');
  });

  it('Dado tela compacta, então continua um modal centralizado (nunca folha inferior)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    await setup();
    expect(screen.getByTestId('dialog-panel')).toHaveAttribute('data-side', 'center');
  });

  it('Dado o diálogo aberto, então o axe não aponta violações', async () => {
    await setup();

    const violations = await axeViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
