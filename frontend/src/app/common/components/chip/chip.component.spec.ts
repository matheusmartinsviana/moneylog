import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { ChipComponent } from '~/app/common/components/chip/chip.component';
import { axeViolations, describeViolations } from '~/testing/axe';

describe('ChipComponent', () => {
  it('Dado um chip alternável, então é um botão com aria-pressed e emite o novo estado', async () => {
    const toggled = vi.fn();
    await render(ChipComponent, {
      inputs: { label: 'revisao', pressed: false, count: 3, cy: 'chip-revisao' },
      on: { toggled },
    });

    const chip = screen.getByRole('button', { name: /revisao/ });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('3')).toBeInTheDocument();
    await userEvent.click(chip);

    expect(toggled).toHaveBeenCalledWith(true);
  });

  it('Dado um chip alternável ligado, então aria-pressed é true e o clique desliga', async () => {
    const toggled = vi.fn();
    await render(ChipComponent, { inputs: { label: 'x', pressed: true }, on: { toggled } });

    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button'));

    expect(toggled).toHaveBeenCalledWith(false);
  });

  it('Dado um chip removível, então o botão tem nome próprio e Backspace/Delete/clique removem', async () => {
    const removed = vi.fn();
    await render(ChipComponent, {
      inputs: { label: 'Alimentação', removeLabel: 'Remover filtro: Alimentação', cy: 'c' },
      on: { removed },
    });

    const remove = screen.getByRole('button', { name: 'Remover filtro: Alimentação' });
    await userEvent.click(remove);
    remove.focus();
    await userEvent.keyboard('{Backspace}{Delete}');

    expect(removed).toHaveBeenCalledTimes(3);
  });

  it('Dado um chip estático, então não é interativo', async () => {
    await render(ChipComponent, { inputs: { label: 'trabalho', cy: 'c' } });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByTestId('c')).toHaveTextContent('trabalho');
  });

  it('Dado os três formatos, então o axe não aponta violações', async () => {
    const { container } = await render(ChipComponent, { inputs: { label: 'tag', pressed: true } });

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
