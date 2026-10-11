import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { MenuComponent, MenuItem } from '~/app/common/components/menu/menu.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({
  selector: 'app-menu-host',
  imports: [MenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main data-cy="page">
      <button type="button" data-cy="before">Antes</button>
      <app-menu
        label="Ações da fatura"
        fieldId="bill-menu"
        [items]="items()"
        (selected)="selected($event)"
      />
      <button type="button" data-cy="after">Depois</button>
    </main>
  `,
})
class MenuHostComponent {
  readonly items = signal<readonly MenuItem[]>([
    { id: 'pay', label: 'Pagar fatura' },
    { id: 'export', label: 'Exportar' },
    { id: 'lock', label: 'Bloqueado', disabled: true },
    { id: 'archive', label: 'Arquivar', destructive: true },
  ]);
  readonly selected = vi.fn();
}

async function setup() {
  const result = await render(MenuHostComponent, { providers: [provideI18nTesting('pt')] });
  const trigger = screen.getByTestId('bill-menu');
  return { ...result, trigger, host: result.fixture.componentInstance };
}

describe('MenuComponent', () => {
  afterEach(() => {
    document.body.removeAttribute('style');
    vi.unstubAllGlobals();
  });

  it('Dado o botão, então anuncia menu fechado com nome acessível', async () => {
    const { trigger } = await setup();

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAccessibleName('Ações da fatura');
  });

  it('Dado Enter no botão, então abre e foca o primeiro item', async () => {
    const { trigger } = await setup();
    trigger.focus();

    await userEvent.keyboard('{Enter}');

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Ações da fatura' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    await vi.waitFor(() => expect(screen.getByTestId('bill-menu-item-pay')).toHaveFocus());
  });

  it('Dado a seta para cima no botão, então abre e foca o último item habilitado', async () => {
    const { trigger } = await setup();
    trigger.focus();

    await userEvent.keyboard('{ArrowUp}');

    await vi.waitFor(() => expect(screen.getByTestId('bill-menu-item-archive')).toHaveFocus());
  });

  it('Dado a seta para baixo no botão, então abre e foca o primeiro item', async () => {
    const { trigger } = await setup();
    trigger.focus();

    await userEvent.keyboard('{ArrowDown}');

    await vi.waitFor(() => expect(screen.getByTestId('bill-menu-item-pay')).toHaveFocus());
  });

  it('Dado o menu aberto, então setas andam em círculo pulando o desabilitado; Home e End vão às pontas', async () => {
    await setup();
    await userEvent.click(screen.getByTestId('bill-menu'));
    await vi.waitFor(() => expect(screen.getByTestId('bill-menu-item-pay')).toHaveFocus());

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('bill-menu-item-export')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('bill-menu-item-archive')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('bill-menu-item-pay')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByTestId('bill-menu-item-archive')).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByTestId('bill-menu-item-pay')).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByTestId('bill-menu-item-archive')).toHaveFocus();
  });

  it('Dado letras digitadas, então pula ao item que começa com elas', async () => {
    await setup();
    await userEvent.click(screen.getByTestId('bill-menu'));
    await vi.waitFor(() => expect(screen.getByTestId('bill-menu-item-pay')).toHaveFocus());

    await userEvent.keyboard('a');
    expect(screen.getByTestId('bill-menu-item-archive')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
  });

  it('Dado Esc, então fecha e devolve o foco ao botão', async () => {
    const { trigger } = await setup();
    await userEvent.click(trigger);
    await vi.waitFor(() => expect(screen.getByTestId('bill-menu-item-pay')).toHaveFocus());

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await vi.waitFor(() => expect(trigger).toHaveFocus());
  });

  it('Dado Tab, então fecha o menu', async () => {
    const { trigger } = await setup();
    await userEvent.click(trigger);
    await vi.waitFor(() => expect(screen.getByTestId('bill-menu-item-pay')).toHaveFocus());

    await userEvent.tab();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(trigger).toHaveFocus());
  });

  it('Dado o clique num item, então emite o id, fecha e o foco já está no botão', async () => {
    const { trigger, host } = await setup();
    await userEvent.click(trigger);

    await userEvent.click(screen.getByTestId('bill-menu-item-export'));

    await vi.waitFor(() => expect(host.selected).toHaveBeenCalledExactlyOnceWith('export'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('Dado Enter num item, então ativa o item', async () => {
    const { trigger, host } = await setup();
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await vi.waitFor(() => expect(screen.getByTestId('bill-menu-item-pay')).toHaveFocus());

    await userEvent.keyboard('{Enter}');

    await vi.waitFor(() => expect(host.selected).toHaveBeenCalledExactlyOnceWith('pay'));
  });

  it('Dado o item desabilitado, então fica aria-disabled e o clique não faz nada', async () => {
    const { trigger, host } = await setup();
    await userEvent.click(trigger);
    const locked = screen.getByTestId('bill-menu-item-lock');

    await userEvent.click(locked);

    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(host.selected).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('Dado o toque fora, então fecha sem escolher', async () => {
    const { trigger, host } = await setup();
    await userEvent.click(trigger);

    await userEvent.click(screen.getByTestId('after'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(host.selected).not.toHaveBeenCalled();
  });

  it('Dado itens com checked, então são menuitemcheckbox e o menu continua aberto', async () => {
    const { trigger, host, fixture } = await setup();
    host.items.set([
      { id: 'a', label: 'Mostrar pagas', checked: true },
      { id: 'b', label: 'Mostrar abertas', checked: false },
    ]);
    fixture.detectChanges();
    await userEvent.click(trigger);

    const items = screen.getAllByRole('menuitemcheckbox');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
    expect(items[1]).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(items[1] as HTMLElement);
    expect(host.selected).toHaveBeenCalledWith('b');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('Dado tela compacta, então abre como modal centralizado com título e botão Fechar', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { trigger } = await setup();

    await userEvent.click(trigger);

    const sheet = screen.getByRole('dialog', { name: 'Ações da fatura' });
    expect(sheet).toHaveAttribute('data-side', 'center');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Dado o menu fechado e aberto, então o axe não aponta violações', async () => {
    const { trigger } = await setup();
    expect(await axeViolations(document.body)).toEqual([]);

    await userEvent.click(trigger);
    const violations = await axeViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
