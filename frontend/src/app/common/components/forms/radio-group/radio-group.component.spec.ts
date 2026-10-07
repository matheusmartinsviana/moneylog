import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import {
  RadioGroupComponent,
  RadioLayout,
} from '~/app/common/components/forms/radio-group/radio-group.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

const OPTIONS: readonly ChoiceOption[] = [
  { value: 'full', label: 'Fatura total', hint: 'Paga tudo de uma vez.' },
  { value: 'min', label: 'Valor mínimo' },
  { value: 'later', label: 'Mais tarde', disabled: true, hint: 'Disponível em breve' },
  { value: 'custom', label: 'Outro valor' },
];

@Component({
  selector: 'app-radio-host',
  imports: [ReactiveFormsModule, RadioGroupComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" data-cy="before">antes</button>
    <app-radio-group
      [formControl]="control"
      fieldId="payment"
      label="Como pagar"
      [options]="options"
      [layout]="layout"
    />
    <button type="button" data-cy="after">depois</button>
  `,
})
class RadioHostComponent {
  options = OPTIONS;
  layout: RadioLayout = 'vertical';
  readonly control = new FormControl<string | null>(null, Validators.required);
}

async function setup(layout: RadioLayout = 'vertical') {
  const result = await render(RadioHostComponent, {
    providers: [provideI18nTesting('pt')],
    componentProperties: { layout },
  });
  return { ...result, control: result.fixture.componentInstance.control };
}

describe('RadioGroupComponent', () => {
  it('Dado as opções, então é um radiogroup nomeado, com aria-checked e descrição visível', async () => {
    const { control, fixture } = await setup();
    control.setValue('min');
    await fixture.whenStable();

    expect(screen.getByRole('radiogroup', { name: 'Como pagar' })).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'Valor mínimo' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Fatura total' })).toHaveAccessibleDescription(
      'Paga tudo de uma vez.',
    );
    expect(screen.getByText('Paga tudo de uma vez.')).toBeVisible();
    expect(screen.getByTestId('payment-later')).toHaveAttribute('aria-disabled', 'true');
  });

  it('Dado o clique, então marca e atualiza o controle; a desabilitada não marca', async () => {
    const { control } = await setup();

    await userEvent.click(screen.getByRole('radio', { name: 'Outro valor' }));
    expect(control.value).toBe('custom');
    await userEvent.click(screen.getByRole('radio', { name: 'Mais tarde' }));
    expect(control.value).toBe('custom');
  });

  it('Dado nada marcado, então Tab entra no primeiro habilitado; com marcação, no marcado (roving tabindex)', async () => {
    const { control, fixture } = await setup();
    expect(screen.getByTestId('payment-full')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('payment-min')).toHaveAttribute('tabindex', '-1');

    control.setValue('custom');
    await fixture.whenStable();
    expect(screen.getByTestId('payment-custom')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('payment-full')).toHaveAttribute('tabindex', '-1');

    screen.getByTestId('before').focus();
    await userEvent.tab();
    expect(screen.getByTestId('payment-custom')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByTestId('after')).toHaveFocus();
  });

  it('Dado as setas, então movem e marcam, pulando a desabilitada, em círculo', async () => {
    const { control } = await setup();
    screen.getByTestId('payment-full').focus();

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('payment-min')).toHaveFocus();
    expect(control.value).toBe('min');

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByTestId('payment-custom')).toHaveFocus();
    expect(control.value).toBe('custom');

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('payment-full')).toHaveFocus();
    expect(control.value).toBe('full');

    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByTestId('payment-custom')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(control.value).toBe('min');
  });

  it('Dado Home e End, então vão à primeira e à última habilitada', async () => {
    const { control } = await setup();
    screen.getByTestId('payment-min').focus();

    await userEvent.keyboard('{End}');
    expect(control.value).toBe('custom');
    await userEvent.keyboard('{Home}');
    expect(control.value).toBe('full');
  });

  it('Dado Espaço no item com foco, então marca', async () => {
    const { control } = await setup();
    screen.getByTestId('payment-min').focus();

    await userEvent.keyboard(' ');

    expect(control.value).toBe('min');
  });

  it('Dado o foco saindo do grupo, então marca como tocado e mostra o erro de obrigatório', async () => {
    const { control } = await setup();

    screen.getByTestId('payment-full').focus();
    await userEvent.tab();

    expect(control.touched).toBe(true);
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findByText('Preencha este campo.')).toBeVisible();
  });

  it('Dado desabilitado, então nada marca', async () => {
    const { control, fixture } = await setup();
    control.disable();
    fixture.detectChanges();

    await userEvent.click(screen.getByTestId('payment-min'));

    expect(control.value).toBeNull();
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-disabled', 'true');
  });

  it.each(['vertical', 'horizontal', 'cards'] as const)(
    'Dado o layout %s, então o axe não aponta violações',
    async (layout) => {
      const { container, control, fixture } = await setup(layout);
      control.setValue('full');
      await fixture.whenStable();

      const violations = await axeViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    },
  );
});
