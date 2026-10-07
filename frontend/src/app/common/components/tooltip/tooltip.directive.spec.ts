import { ChangeDetectionStrategy, Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { TooltipDirective } from '~/app/common/components/tooltip/tooltip.directive';

@Component({
  selector: 'app-tooltip-host',
  imports: [TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" appTooltip="Disponível em breve">Crédito</button>`,
})
class HostComponent {}

describe('TooltipDirective', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado o foco por teclado, então mostra role tooltip ligado por aria-describedby e Esc fecha', async () => {
    await render(HostComponent);
    const button = screen.getByRole('button', { name: 'Crédito' });

    await userEvent.tab();
    // jsdom não implementa :focus-visible de forma confiável: mostra pelo hover.
    await userEvent.hover(button);
    const tip = await screen.findByRole('tooltip');

    expect(tip).toHaveTextContent('Disponível em breve');
    expect(button).toHaveAccessibleDescription('Disponível em breve');
    expect(button).not.toHaveAttribute('title');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('Dado que o ponteiro sai, então o tooltip some e o aria-describedby é removido', async () => {
    await render(HostComponent);
    const button = screen.getByRole('button', { name: 'Crédito' });

    await userEvent.hover(button);
    await screen.findByRole('tooltip');
    await userEvent.unhover(button);

    await vi.waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(button).not.toHaveAttribute('aria-describedby');
  });

  it('Dado que o ponteiro vai do gatilho ao balão, então o tooltip fica (hoverable) e some ao sair dele', async () => {
    // Relógio falso: o tempo avança só quando o teste manda, então a carga da máquina não muda o resultado.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    await render(HostComponent);
    const button = screen.getByRole('button', { name: 'Crédito' });

    await user.hover(button);
    await vi.advanceTimersByTimeAsync(500);
    const tooltip = await screen.findByRole('tooltip');
    await user.unhover(button);
    await user.hover(tooltip);
    await vi.advanceTimersByTimeAsync(250);

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await user.unhover(tooltip);
    await vi.advanceTimersByTimeAsync(300);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
