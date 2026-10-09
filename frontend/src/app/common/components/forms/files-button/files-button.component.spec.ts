import { fireEvent, render, screen } from '@testing-library/angular';

import { FilesButtonComponent } from '~/app/common/components/forms/files-button/files-button.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup(inputs: Partial<{ disabled: boolean }> = {}) {
  const picked = vi.fn();
  const result = await render(FilesButtonComponent, {
    inputs: { label: 'Adicionar fotos', cy: 'add-photos', accept: '.jpg,.png', ...inputs },
    on: { picked },
    providers: [provideI18nTesting('pt')],
  });
  return { ...result, picked };
}

describe('FilesButtonComponent', () => {
  it('Dado o botão, então o input de arquivo é escondido, múltiplo e fora da tabulação e da árvore de acessibilidade', async () => {
    await setup();

    const input = screen.getByTestId('add-photos-native');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('hidden');
    expect(input).toHaveAttribute('multiple');
    expect(input).toHaveAttribute('tabindex', '-1');
    expect(input).toHaveAttribute('aria-hidden', 'true');
    expect(input).toHaveAttribute('accept', '.jpg,.png');
    expect(screen.getByRole('button', { name: 'Adicionar fotos' })).toBeInTheDocument();
  });

  it('Dado o clique no botão próprio, então aciona o seletor do sistema (clique no input escondido)', async () => {
    await setup();
    const click = vi.spyOn(screen.getByTestId('add-photos-native'), 'click');

    fireEvent.click(screen.getByTestId('add-photos'));

    expect(click).toHaveBeenCalledTimes(1);
  });

  it('Dado vários arquivos escolhidos, então entrega todos de uma vez e limpa o input para poder repetir', async () => {
    const { picked } = await setup();
    const input = screen.getByTestId('add-photos-native') as HTMLInputElement;
    const files = [new File(['a'], 'a.jpg'), new File(['b'], 'b.png')];
    Object.defineProperty(input, 'files', { configurable: true, value: files });

    fireEvent.change(input);

    expect(picked).toHaveBeenCalledWith(files);
    expect(input.value).toBe('');
  });

  it('Dado desabilitado, então o botão não abre o seletor', async () => {
    await setup({ disabled: true });

    expect(screen.getByTestId('add-photos')).toBeDisabled();
  });

  it('Dado o botão, então não há violações de acessibilidade', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
