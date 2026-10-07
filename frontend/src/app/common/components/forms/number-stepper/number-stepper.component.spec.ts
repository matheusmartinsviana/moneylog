import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { NumberStepperComponent } from '~/app/common/components/forms/number-stepper/number-stepper.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

const installmentsText = (n: number): string => (n === 1 ? '1 parcela' : `${n} parcelas`);

@Component({
  selector: 'app-stepper-host',
  imports: [ReactiveFormsModule, NumberStepperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-number-stepper
    [formControl]="control"
    fieldId="installments"
    label="Parcelas"
    [min]="1"
    [max]="36"
    [mandatory]="mandatory"
    [valueText]="valueText"
  />`,
})
class StepperHostComponent {
  mandatory = true;
  readonly valueText = installmentsText;
  readonly control = new FormControl<number | null>(null, Validators.required);
}

async function setup(initial: number | null = null, mandatory = true) {
  const result = await render(StepperHostComponent, {
    providers: [provideI18nTesting('pt')],
    componentProperties: { mandatory },
  });
  const control = result.fixture.componentInstance.control;
  control.setValue(initial);
  result.fixture.detectChanges();
  await result.fixture.whenStable();
  return { ...result, control, field: screen.getByTestId('installments') as HTMLInputElement };
}

describe('NumberStepperComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado o campo, então é um spinbutton nomeado com limites e texto do valor', async () => {
    const { field } = await setup(6);

    expect(screen.getByRole('spinbutton', { name: 'Parcelas' })).toBe(field);
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveAttribute('inputmode', 'numeric');
    expect(field).toHaveAttribute('aria-valuemin', '1');
    expect(field).toHaveAttribute('aria-valuemax', '36');
    expect(field).toHaveAttribute('aria-valuenow', '6');
    expect(field).toHaveAttribute('aria-valuetext', '6 parcelas');
    expect(field).toHaveValue('6');
    expect(screen.getByRole('button', { name: 'Diminuir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aumentar' })).toBeInTheDocument();
  });

  it('Dado as setas, então somam e subtraem o passo e param nos limites', async () => {
    const { field, control } = await setup(35);
    field.focus();

    await userEvent.keyboard('{ArrowUp}');
    expect(control.value).toBe(36);
    await userEvent.keyboard('{ArrowUp}');
    expect(control.value).toBe(36);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(control.value).toBe(34);
    expect(field).toHaveValue('34');
  });

  it('Dado PageUp, PageDown, Home e End, então movem dez passos e vão aos limites', async () => {
    const { field, control } = await setup(15);
    field.focus();

    await userEvent.keyboard('{PageUp}');
    expect(control.value).toBe(25);
    await userEvent.keyboard('{PageUp}{PageUp}');
    expect(control.value).toBe(36);
    await userEvent.keyboard('{PageDown}');
    expect(control.value).toBe(26);
    await userEvent.keyboard('{Home}');
    expect(control.value).toBe(1);
    await userEvent.keyboard('{End}');
    expect(control.value).toBe(36);
  });

  it('Dado os botões, então + e − mudam o valor; nos limites ficam aria-disabled', async () => {
    const { control } = await setup(2);

    await userEvent.click(screen.getByRole('button', { name: 'Aumentar' }));
    expect(control.value).toBe(3);
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir' }));
    expect(control.value).toBe(1);
    expect(screen.getByRole('button', { name: 'Diminuir' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir' }));
    expect(control.value).toBe(1);
  });

  it('Dado o campo vazio, então o + vai para o mínimo', async () => {
    const { control } = await setup(null);

    await userEvent.click(screen.getByRole('button', { name: 'Aumentar' }));

    expect(control.value).toBe(1);
  });

  it('Dado a digitação, então só aceita dígitos (sem ponto, vírgula, e ou sinal)', async () => {
    const { field, control } = await setup(null);

    await userEvent.type(field, '1e,.-2');

    expect(field).toHaveValue('12');
    expect(control.value).toBe(12);
  });

  it('Dado um valor fora dos limites digitado, então não vira valor e o campo volta ao último válido ao sair', async () => {
    const { field, control } = await setup(6);

    await userEvent.clear(field);
    await userEvent.type(field, '40');
    // "4" era válido e foi para o formulário; "40" passa de 36 e é ignorado.
    expect(control.value).toBe(4);
    expect(field).toHaveValue('40');
    await userEvent.tab();

    expect(field).toHaveValue('4');
    expect(control.value).toBe(4);
  });

  it('Dado zero (abaixo do mínimo), então volta ao último válido ao sair', async () => {
    const { field, control } = await setup(3);

    await userEvent.clear(field);
    await userEvent.type(field, '0');
    await userEvent.tab();

    expect(field).toHaveValue('3');
    expect(control.value).toBe(3);
  });

  it('Dado digitar passo a passo, então valores intermediários inválidos não atrapalham (1 e depois 12)', async () => {
    const { field, control } = await setup(null);

    await userEvent.type(field, '1');
    expect(control.value).toBe(1);
    await userEvent.type(field, '2');
    expect(control.value).toBe(12);
  });

  it('Dado campo opcional, então esvaziar vira null', async () => {
    const { field, control } = await setup(6, false);

    await userEvent.clear(field);

    expect(control.value).toBeNull();
    await userEvent.tab();
    expect(field).toHaveValue('');
  });

  it('Dado campo obrigatório vazio e tocado, então mostra o erro e aria-invalid', async () => {
    const { field } = await setup(null);

    field.focus();
    await userEvent.tab();

    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findByText('Preencha este campo.')).toBeVisible();
  });

  it('Dado desabilitado, então campo e botões não respondem', async () => {
    const { field, control, fixture } = await setup(5);
    control.disable();
    fixture.detectChanges();

    expect(field).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Aumentar' })).toBeDisabled();
  });

  it('Dado segurar o botão, então repete com aceleração e para ao soltar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['setTimeout', 'clearTimeout'] });
    const { control } = await setup(1);
    const plus = screen.getByRole('button', { name: 'Aumentar' });

    fireEvent.pointerDown(plus, { button: 0, pointerType: 'mouse' });
    expect(control.value).toBe(2);
    vi.advanceTimersByTime(400);
    expect(control.value).toBe(3);
    vi.advanceTimersByTime(160 * 5);
    expect(control.value).toBe(8);
    fireEvent.pointerUp(plus, { pointerType: 'mouse' });
    vi.advanceTimersByTime(2000);
    expect(control.value).toBe(8);
  });

  it('Dado segurar até o limite, então a repetição para sozinha', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['setTimeout', 'clearTimeout'] });
    const { control } = await setup(34);
    const plus = screen.getByRole('button', { name: 'Aumentar' });

    fireEvent.pointerDown(plus, { button: 0, pointerType: 'touch' });
    vi.advanceTimersByTime(5000);

    expect(control.value).toBe(36);
    fireEvent.pointerUp(plus, { pointerType: 'touch' });
  });

  it('Dado o clique logo depois do soltar do ponteiro, então não soma duas vezes', async () => {
    const { control } = await setup(1);

    await userEvent.click(screen.getByRole('button', { name: 'Aumentar' }));

    expect(control.value).toBe(2);
  });

  it('Dado o ponto flutuante vindo do formulário, então é descartado (só inteiros)', async () => {
    const { control, field, fixture } = await setup(null);

    control.setValue(2.5);
    fixture.detectChanges();

    expect(field).toHaveValue('');
  });

  it('Dado o campo, então o axe não aponta violações', async () => {
    const { container } = await setup(6);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
