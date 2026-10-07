import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { FilePickerComponent } from '~/app/common/components/forms/file-picker/file-picker.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({
  imports: [ReactiveFormsModule, FilePickerComponent],
  template: `
    <app-file-picker
      label="Arquivo zip do vault"
      fieldId="picker"
      hint="Até 20 MB"
      accept=".zip"
      [maxBytes]="1024"
      [formControl]="control"
      (rejected)="rejections.push($event)"
    />
  `,
})
class HostComponent {
  readonly control = new FormControl<File | null>(null);
  readonly rejections: string[] = [];
}

const zip = (size = 10, name = 'vault.zip') => new File([new Uint8Array(size)], name);

describe('FilePickerComponent', () => {
  it('Dado o componente, então o único input file é escondido, fora da tabulação e dentro dele', async () => {
    const { container } = await render(HostComponent, { providers: [provideI18nTesting('pt')] });

    const inputs = container.querySelectorAll('input[type="file"]');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toHaveAttribute('hidden');
    expect(inputs[0]).toHaveAttribute('tabindex', '-1');
    expect(inputs[0]).toHaveAttribute('aria-hidden', 'true');
    expect(inputs[0]?.closest('app-file-picker')).not.toBeNull();
    expect(inputs[0]).toHaveAttribute('accept', '.zip');
  });

  it('Dado o botão, então abre o seletor do sistema por clique e por teclado (Enter e Espaço)', async () => {
    await render(HostComponent, { providers: [provideI18nTesting('pt')] });
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    const button = screen.getByRole('button', { name: /Arquivo zip do vault/ });

    await userEvent.click(button);
    button.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(click).toHaveBeenCalledTimes(3);
    click.mockRestore();
  });

  it('Dado um zip válido, então vira o valor, mostra nome e tamanho e anuncia o recebimento', async () => {
    const { fixture } = await render(HostComponent, { providers: [provideI18nTesting('pt')] });

    await userEvent.upload(screen.getByTestId('picker-native'), zip(512));

    expect(fixture.componentInstance.control.value?.name).toBe('vault.zip');
    expect(screen.getByTestId('picker-name')).toHaveTextContent('vault.zip');
    expect(screen.getByTestId('picker-size')).toHaveTextContent('512 B');
    expect(screen.getByTestId('picker-announce')).toHaveTextContent('Arquivo recebido: vault.zip');
  });

  it('Dado arquivo de outro tipo, então é recusado com erro de campo (sem alert) e não vira valor', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { fixture } = await render(HostComponent, { providers: [provideI18nTesting('pt')] });

    await user.upload(screen.getByTestId('picker-native'), zip(10, 'vault.rar'));

    expect(fixture.componentInstance.control.value).toBeNull();
    expect(fixture.componentInstance.rejections).toEqual(['wrongType']);
    expect(screen.getByTestId('picker-error')).toHaveTextContent('Escolha um arquivo .zip.');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('Dado arquivo acima do tamanho máximo ou vazio, então o motivo aparece', async () => {
    const { fixture } = await render(HostComponent, { providers: [provideI18nTesting('pt')] });

    await userEvent.upload(screen.getByTestId('picker-native'), zip(2048));
    expect(screen.getByTestId('picker-error')).toHaveTextContent('tamanho máximo de 1 KB');
    await userEvent.upload(screen.getByTestId('picker-native'), zip(0));
    expect(screen.getByTestId('picker-error')).toHaveTextContent('O arquivo está vazio.');

    expect(fixture.componentInstance.rejections).toEqual(['tooLarge', 'empty']);
    expect(fixture.componentInstance.control.value).toBeNull();
  });

  it('Dado remover, então volta ao vazio e o valor é nulo', async () => {
    const { fixture } = await render(HostComponent, { providers: [provideI18nTesting('pt')] });
    await userEvent.upload(screen.getByTestId('picker-native'), zip());

    await userEvent.click(screen.getByTestId('picker-remove'));

    expect(fixture.componentInstance.control.value).toBeNull();
    expect(screen.queryByTestId('picker-file')).not.toBeInTheDocument();
  });

  it('Dado arrastar e soltar um arquivo, então o estado de destino aparece e o arquivo é recebido', async () => {
    const { fixture, container } = await render(HostComponent, {
      providers: [provideI18nTesting('pt')],
    });
    const zone = container.querySelector('.picker') as HTMLElement;
    const file = zip(100, 'solto.zip');

    zone.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(zone).toHaveClass('picker--drag');

    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: { item: () => file } } });
    zone.dispatchEvent(drop);
    fixture.detectChanges();

    expect(zone).not.toHaveClass('picker--drag');
    expect(fixture.componentInstance.control.value?.name).toBe('solto.zip');
  });

  it('Dado o controle desabilitado, então o botão não abre o seletor', async () => {
    const { fixture } = await render(HostComponent, { providers: [provideI18nTesting('pt')] });
    fixture.componentInstance.control.disable();
    fixture.detectChanges();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');

    expect(screen.getByTestId('picker')).toBeDisabled();
    click.mockRestore();
  });

  it('Dado o componente com e sem arquivo, então o axe não aponta violações', async () => {
    const { container } = await render(HostComponent, { providers: [provideI18nTesting('pt')] });
    let violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);

    await userEvent.upload(screen.getByTestId('picker-native'), zip());
    violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
