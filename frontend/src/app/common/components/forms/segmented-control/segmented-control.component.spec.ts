import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

const OPTIONS: readonly ChoiceOption[] = [
  { value: 'expense', label: 'Despesa' },
  { value: 'pix', label: 'Pix' },
  { value: 'credit', label: 'Crédito', disabled: true, hint: 'Disponível em breve' },
  { value: 'income', label: 'Receita' },
];

@Component({
  selector: 'app-segmented-host',
  imports: [ReactiveFormsModule, SegmentedControlComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-segmented-control
    [formControl]="control"
    fieldId="mode"
    label="Tipo"
    [options]="options"
  />`,
})
class SegmentedHostComponent {
  readonly options = OPTIONS;
  readonly control = new FormControl<string | null>(null);
}

async function setup() {
  const result = await render(SegmentedHostComponent, { providers: [provideI18nTesting('pt')] });
  return { ...result, control: result.fixture.componentInstance.control };
}

describe('SegmentedControlComponent', () => {
  it('Dado as opções, então é um radiogroup nomeado, com data-cy por opção e aria-checked correto', async () => {
    const { control, fixture } = await setup();
    control.setValue('pix');
    await fixture.whenStable();

    expect(screen.getByRole('radiogroup', { name: 'Tipo' })).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByTestId('mode-pix')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('mode-expense')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('mode-credit')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('mode-credit')).toHaveAccessibleDescription('Disponível em breve');
  });

  it('Dado o clique, então marca a opção e atualiza o controle; a desabilitada não marca', async () => {
    const { control } = await setup();

    await userEvent.click(screen.getByTestId('mode-income'));
    expect(control.value).toBe('income');

    await userEvent.click(screen.getByTestId('mode-credit'));
    expect(control.value).toBe('income');
  });

  it('Dado o teclado, então as setas movem e marcam, pulando a opção desabilitada, e Home/End vão às pontas', async () => {
    const { control } = await setup();

    await userEvent.tab();
    expect(screen.getByTestId('mode-expense')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(control.value).toBe('pix');
    expect(screen.getByTestId('mode-pix')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(control.value).toBe('income');
    await userEvent.keyboard('{ArrowRight}');
    expect(control.value).toBe('expense');
    await userEvent.keyboard('{ArrowLeft}');
    expect(control.value).toBe('income');
    await userEvent.keyboard('{Home}');
    expect(control.value).toBe('expense');
    await userEvent.keyboard('{End}');
    expect(control.value).toBe('income');
  });

  it('Dado Enter e Espaço no item com foco, então marcam o item', async () => {
    const { control } = await setup();

    screen.getByTestId('mode-pix').focus();
    await userEvent.keyboard('{Enter}');
    expect(control.value).toBe('pix');
    screen.getByTestId('mode-income').focus();
    await userEvent.keyboard(' ');
    expect(control.value).toBe('income');
  });

  it('Dado o grupo, então só o item marcado entra na ordem de Tab (roving tabindex)', async () => {
    const { control, fixture } = await setup();
    control.setValue('income');
    await fixture.whenStable();

    expect(screen.getByTestId('mode-income')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('mode-expense')).toHaveAttribute('tabindex', '-1');
  });

  it('Dado que saio do grupo sem escolher, então o erro de obrigatório aparece', async () => {
    await setup();

    await userEvent.tab();
    await userEvent.tab();

    expect(screen.getByText('Preencha este campo.')).toBeVisible();
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-invalid', 'true');
  });

  it('Dado o grupo, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
