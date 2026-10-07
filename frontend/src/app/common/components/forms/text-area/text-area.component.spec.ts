import { Component, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { TextAreaComponent } from '~/app/common/components/forms/text-area/text-area.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({
  imports: [ReactiveFormsModule, TextAreaComponent],
  template: `
    <app-text-area
      label="Texto da nota"
      fieldId="area"
      hint="Markdown aceito"
      [rows]="4"
      [formControl]="control"
      (keyPressed)="keys.push($event.key)"
    />
  `,
})
class HostComponent {
  readonly control = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly keys: string[] = [];
  readonly area = viewChild.required(TextAreaComponent);
}

describe('TextAreaComponent', () => {
  it('Dado digitar, então o valor do controle acompanha e o rótulo é o nome acessível', async () => {
    const { fixture } = await render(HostComponent, { providers: [provideI18nTesting('pt')] });

    await userEvent.type(screen.getByRole('textbox', { name: 'Texto da nota' }), 'olá\nmundo');

    expect(fixture.componentInstance.control.value).toBe('olá\nmundo');
  });

  it('Dado o controle escrito por fora, então o campo mostra o valor', async () => {
    const { fixture } = await render(HostComponent, { providers: [provideI18nTesting('pt')] });

    fixture.componentInstance.control.setValue('# Título');
    fixture.detectChanges();

    expect(screen.getByTestId('area')).toHaveValue('# Título');
  });

  it('Dado a dica e o erro, então ficam ligados por aria-describedby (erro só depois de tocado)', async () => {
    const { fixture } = await render(HostComponent, { providers: [provideI18nTesting('pt')] });
    const area = screen.getByTestId('area');
    expect(area).toHaveAttribute('aria-describedby', expect.stringContaining('-hint'));
    expect(area).toHaveAttribute('aria-invalid', 'false');

    area.focus();
    area.blur();
    fixture.detectChanges();

    expect(area).toHaveAttribute('aria-invalid', 'true');
    expect(area.getAttribute('aria-describedby')).toContain('-error');
  });

  it('Dado uma tecla, então o evento keyPressed sai antes do padrão e dá para tomá-la', async () => {
    const { fixture } = await render(HostComponent, { providers: [provideI18nTesting('pt')] });
    await userEvent.type(screen.getByTestId('area'), 'a{Tab}');

    expect(fixture.componentInstance.keys).toContain('a');
    expect(fixture.componentInstance.keys).toContain('Tab');
  });

  it('Dado replaceRange, então troca o trecho, atualiza o controle e posiciona a seleção', async () => {
    const { fixture } = await render(HostComponent, { providers: [provideI18nTesting('pt')] });
    fixture.componentInstance.control.setValue('um dois três');
    fixture.detectChanges();
    const area = fixture.componentInstance.area();

    area.replaceRange(3, 7, '**dois**', 5, 9);

    expect(fixture.componentInstance.control.value).toBe('um **dois** três');
    expect(area.selection()).toEqual({ start: 5, end: 9 });
  });

  it('Dado setSelection e selection, então lê e escreve o cursor', async () => {
    const { fixture } = await render(HostComponent, { providers: [provideI18nTesting('pt')] });
    fixture.componentInstance.control.setValue('abcdef');
    fixture.detectChanges();
    const area = fixture.componentInstance.area();

    area.setSelection(2, 4);

    expect(area.selection()).toEqual({ start: 2, end: 4 });
  });

  it('Dado o atributo resize, então o campo não é redimensionável pelo usuário (CSS próprio)', async () => {
    await render(HostComponent, { providers: [provideI18nTesting('pt')] });

    expect(screen.getByTestId('area').tagName).toBe('TEXTAREA');
  });

  it('Dado o campo, então o axe não aponta violações', async () => {
    const { container } = await render(HostComponent, { providers: [provideI18nTesting('pt')] });

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
