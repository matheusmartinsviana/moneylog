import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { DisclosureComponent } from '~/app/common/components/disclosure/disclosure.component';
import { axeViolations, describeViolations } from '~/testing/axe';

@Component({
  selector: 'app-disclosure-host',
  imports: [DisclosureComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-disclosure fieldId="more" heading="Arquivadas (1)" [(open)]="open">
    <button type="button">Desarquivar</button>
  </app-disclosure>`,
})
class HostComponent {
  readonly open = signal(false);
}

describe('DisclosureComponent', () => {
  async function setup() {
    const result = await render(HostComponent);
    return { ...result, host: result.fixture.componentInstance };
  }

  it('Dado fechado, então o cabeçalho é um botão com aria-expanded=false e a região fica inerte', async () => {
    await setup();
    const header = screen.getByRole('button', { name: 'Arquivadas (1)' });

    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('more').querySelector('[role="region"]')).toHaveAttribute('inert');
    expect(header).toHaveAttribute('aria-controls');
  });

  it('Dado o clique ou Enter, então abre, emite open e a região fica acessível', async () => {
    const { host } = await setup();
    const header = screen.getByTestId('more-toggle');

    await userEvent.click(header);
    expect(host.open()).toBe(true);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Arquivadas (1)' })).not.toHaveAttribute('inert');

    await userEvent.keyboard('{Enter}');
    expect(host.open()).toBe(false);
  });

  it('Dado o controle de fora (open=true), então abre sem clique', async () => {
    const { host, fixture } = await setup();
    host.open.set(true);
    fixture.detectChanges();

    expect(screen.getByTestId('more-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  it('Dado o cabeçalho, então o botão fica dentro de um heading', async () => {
    await setup();

    expect(screen.getByRole('heading', { level: 2 })).toContainElement(
      screen.getByRole('button', { name: 'Arquivadas (1)' }),
    );
  });

  it('Dado lazy aberto por fora e fechado, então o conteúdo continua montado', async () => {
    @Component({
      selector: 'app-lazy-host',
      imports: [DisclosureComponent],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<app-disclosure fieldId="lazy" heading="Mais" [lazy]="true" [(open)]="open">
        <p>Conteúdo</p>
      </app-disclosure>`,
    })
    class LazyHostComponent {
      readonly open = signal(false);
    }
    const { fixture } = await render(LazyHostComponent);
    expect(screen.queryByText('Conteúdo')).not.toBeInTheDocument();

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
    fixture.componentInstance.open.set(false);
    fixture.detectChanges();

    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
  });

  it('Dado o componente, então o axe não aponta violações', async () => {
    const { container } = await setup();
    await userEvent.click(screen.getByTestId('more-toggle'));
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
