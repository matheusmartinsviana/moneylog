import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { TabPanelDirective } from '~/app/common/components/tabs/tab-panel.directive';
import { TabItem, TabsComponent } from '~/app/common/components/tabs/tabs.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({
  selector: 'app-tabs-host',
  imports: [TabsComponent, TabPanelDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-tabs label="Visões do cartão" fieldId="card-tabs" [tabs]="tabs" [(active)]="active">
      <ng-template appTabPanel="invoice"><p>Fatura aberta</p></ng-template>
      <ng-template appTabPanel="limit"><button type="button">Ajustar</button></ng-template>
      <ng-template appTabPanel="history"><p>Histórico</p></ng-template>
    </app-tabs>
  `,
})
class TabsHostComponent {
  readonly tabs: readonly TabItem[] = [
    { id: 'invoice', label: 'Fatura' },
    { id: 'limit', label: 'Limite' },
    { id: 'blocked', label: 'Bloqueada', disabled: true },
    { id: 'history', label: 'Histórico' },
  ];
  readonly active = signal<string | null>(null);
}

async function setup(initial: string | null = null) {
  const result = await render(TabsHostComponent, { providers: [provideI18nTesting('pt')] });
  result.fixture.componentInstance.active.set(initial);
  result.fixture.detectChanges();
  await result.fixture.whenStable();
  return { ...result, host: result.fixture.componentInstance };
}

describe('TabsComponent', () => {
  it('Dado as abas, então é um tablist nomeado, a primeira aberta e só o painel ativo visível', async () => {
    await setup();

    expect(screen.getByRole('tablist', { name: 'Visões do cartão' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'Fatura' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Limite' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel', { name: 'Fatura' })).toBeVisible();
    expect(screen.getByText('Fatura aberta')).toBeVisible();
    // Painel de uma aba nunca aberta nem existe (montagem preguiçosa).
    expect(screen.queryByText('Histórico', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('Dado a aba ativa, então tem roving tabindex e aria-controls aponta para o painel', async () => {
    await setup();
    const invoice = screen.getByRole('tab', { name: 'Fatura' });

    expect(invoice).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Limite' })).toHaveAttribute('tabindex', '-1');
    const panel = screen.getByRole('tabpanel');
    expect(invoice.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', invoice.id);
  });

  it('Dado o clique, então abre a aba, atualiza [(active)] e monta o painel', async () => {
    const { host } = await setup();

    await userEvent.click(screen.getByRole('tab', { name: 'Limite' }));

    expect(host.active()).toBe('limit');
    expect(screen.getByRole('tabpanel', { name: 'Limite' })).toBeVisible();
    expect(screen.getByText('Fatura aberta')).not.toBeVisible();
  });

  it('Dado as setas, então movem o foco e abrem a aba (ativação automática), pulando a desabilitada, em círculo', async () => {
    const { host } = await setup();
    screen.getByRole('tab', { name: 'Fatura' }).focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Limite' })).toHaveFocus();
    expect(host.active()).toBe('limit');

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Histórico' })).toHaveFocus();
    expect(host.active()).toBe('history');

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Fatura' })).toHaveFocus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Histórico' })).toHaveFocus();
  });

  it('Dado Home e End, então vão à primeira e à última aba habilitada', async () => {
    const { host } = await setup();
    screen.getByRole('tab', { name: 'Fatura' }).focus();

    await userEvent.keyboard('{End}');
    expect(host.active()).toBe('history');
    await userEvent.keyboard('{Home}');
    expect(host.active()).toBe('invoice');
  });

  it('Dado a aba desabilitada, então o clique não a abre e ela é aria-disabled', async () => {
    const { host } = await setup();
    const blocked = screen.getByRole('tab', { name: 'Bloqueada' });

    await userEvent.click(blocked);

    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    expect(host.active()).toBeNull();
    expect(screen.getByRole('tab', { name: 'Fatura' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Dado active vindo de fora (URL), então abre essa aba; inválido cai na primeira', async () => {
    await setup('history');
    expect(screen.getByRole('tab', { name: 'Histórico' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Dado active inválido, então a primeira habilitada abre', async () => {
    await setup('nao-existe');
    expect(screen.getByRole('tab', { name: 'Fatura' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Dado Tab a partir da aba, então o foco vai ao painel (que é focável) e depois ao conteúdo', async () => {
    await setup('limit');
    screen.getByRole('tab', { name: 'Limite' }).focus();

    await userEvent.tab();
    expect(screen.getByRole('tabpanel')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Ajustar' })).toHaveFocus();
  });

  it('Dado as abas, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
