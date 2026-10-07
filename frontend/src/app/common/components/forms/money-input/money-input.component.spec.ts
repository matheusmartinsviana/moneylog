import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { MoneyInputComponent } from '~/app/common/components/forms/money-input/money-input.component';
import type { Language } from '~/app/common/i18n/i18n';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({
  selector: 'app-money-host',
  imports: [ReactiveFormsModule, MoneyInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form">
      <app-money-input
        formControlName="amount"
        fieldId="amount"
        label="Valor"
        hint="Use vírgula para os centavos."
        [allowNegative]="allowNegative()"
        [allowZero]="allowZero()"
        [mandatory]="required()"
      />
      <app-money-input formControlName="other" fieldId="other" label="Outro valor" />
    </form>
  `,
})
class MoneyHostComponent {
  readonly allowNegative = input(false);
  readonly allowZero = input(false);
  readonly required = input(true);
  readonly form = new FormGroup({
    amount: new FormControl<string | null>(null),
    other: new FormControl<string | null>(null),
  });
}

async function setup(
  inputs: Partial<Record<'allowNegative' | 'allowZero' | 'required', boolean>> = {},
  language: Language = 'pt',
) {
  const result = await render(MoneyHostComponent, {
    inputs,
    providers: [provideI18nTesting(language)],
  });
  const form = result.fixture.componentInstance.form;
  const field = screen.getByTestId('amount') as HTMLInputElement;
  return { ...result, form, field };
}

describe('MoneyInputComponent', () => {
  it('Dado pt, quando digito 1.234,5, então o controle vale a string "1234.50" e o campo exibe 1.234,50', async () => {
    const { form, field, fixture } = await setup();

    await userEvent.type(field, '1.234,5');
    expect(form.controls.amount.value).toBe('1234.50');
    expect(typeof form.controls.amount.value).toBe('string');

    await userEvent.tab();
    await fixture.whenStable();
    expect(field).toHaveValue('1.234,50');
    expect(form.controls.amount.valid).toBe(true);
  });

  it('Dado 0,1 e 0,2 em dois campos, então os valores são "0.10" e "0.20" (sem soma em float)', async () => {
    const { form, field } = await setup();

    await userEvent.type(field, '0,1');
    await userEvent.type(screen.getByTestId('other'), '0,2');

    expect(form.value).toEqual({ amount: '0.10', other: '0.20' });
  });

  it('Dado o campo, então o teclado do celular é decimal e o símbolo da moeda é só visual', async () => {
    const { field, container } = await setup();

    expect(field).toHaveAttribute('inputmode', 'decimal');
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveAccessibleName('Valor');
    expect(field).toHaveAccessibleDescription(/Valor em real brasileiro\./i);
    expect(container.querySelector('.money__symbol')).toHaveTextContent('R$');
    expect(container.querySelector('.money__symbol')).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([
    ['12,345', 'Use no máximo 2 casas decimais.'],
    ['abc', 'Digite um valor como 1.234,56.'],
    ['0', 'O valor precisa ser maior que zero.'],
    ['-5', 'O valor não pode ser negativo.'],
  ])(
    'Dado "%s", então o controle fica inválido com a mensagem "%s" depois de tocado',
    async (text, message) => {
      const { form, field, fixture } = await setup();

      await userEvent.type(field, text);
      expect(form.controls.amount.value).toBeNull();
      expect(form.controls.amount.invalid).toBe(true);
      expect(screen.queryByText(message)).not.toBeInTheDocument();

      await userEvent.tab();
      await fixture.whenStable();
      expect(screen.getByText(message)).toBeVisible();
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveAccessibleDescription(expect.stringContaining(message));
      // Texto inválido não é reformatado: o usuário corrige o que digitou.
      expect(field).toHaveValue(text);
    },
  );

  it('Dado o campo vazio, então é obrigatório e a mensagem só aparece depois de tocado', async () => {
    const { form, field, fixture } = await setup();

    expect(form.controls.amount.errors).toEqual({ required: true });
    expect(screen.queryByText('Preencha este campo.')).not.toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'false');

    form.markAllAsTouched();
    await fixture.whenStable();
    expect(screen.getAllByText('Preencha este campo.')[0]).toBeVisible();
    expect(field).toHaveAccessibleDescription(expect.stringContaining('Preencha este campo.'));
  });

  it('Dado o campo opcional e vazio, então é válido com valor null', async () => {
    const { form } = await setup({ required: false });

    expect(form.controls.amount.valid).toBe(true);
    expect(form.controls.amount.value).toBeNull();
  });

  it('Dado um valor do modelo, então o campo exibe formatado sem alterar o controle', async () => {
    const { form, field, fixture } = await setup();

    form.controls.amount.setValue('99.9');
    await fixture.whenStable();

    expect(field).toHaveValue('99,90');
    expect(form.controls.amount.value).toBe('99.9');
    expect(form.controls.amount.valid).toBe(true);

    form.controls.amount.setValue(null);
    await fixture.whenStable();
    expect(field).toHaveValue('');
  });

  it('Dado as regras do saldo inicial, então aceita zero e negativo', async () => {
    const { form, field } = await setup({ allowNegative: true, allowZero: true });

    await userEvent.type(field, '-1.234,5');
    expect(form.controls.amount.value).toBe('-1234.50');

    await userEvent.clear(field);
    await userEvent.type(field, '0');
    expect(form.controls.amount.value).toBe('0.00');
    expect(form.controls.amount.valid).toBe(true);
  });

  it('Dado que a regra muda depois de digitar, então o campo revalida o texto atual', async () => {
    const { form, field, fixture } = await setup();

    await userEvent.type(field, '-5');
    expect(form.controls.amount.errors).toEqual({ moneyNegative: true });

    fixture.componentRef.setInput('allowNegative', true);
    await fixture.whenStable();

    expect(form.controls.amount.value).toBe('-5.00');
    expect(form.controls.amount.valid).toBe(true);
  });

  it('Dado a interface em inglês e um valor em BRL, então os separadores seguem a moeda do dado', async () => {
    const { form, field } = await setup({}, 'en');

    await userEvent.type(field, '1.234,5');

    expect(form.controls.amount.value).toBe('1234.50');
    expect(field).toHaveAccessibleDescription(/Amount in brazilian real\./i);
  });

  it('Dado o controle desabilitado, então o campo fica desabilitado', async () => {
    const { form, field, fixture } = await setup();

    form.controls.amount.disable();
    await fixture.whenStable();

    expect(field).toBeDisabled();
  });

  it('Dado o campo com erro visível, então o axe não aponta violações', async () => {
    const { container, field, fixture } = await setup();

    await userEvent.type(field, 'abc');
    await userEvent.tab();
    await fixture.whenStable();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
