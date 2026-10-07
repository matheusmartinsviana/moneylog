import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({
  selector: 'app-text-host',
  imports: [ReactiveFormsModule, TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form">
      <app-text-field
        formControlName="name"
        fieldId="name"
        label="Nome"
        hint="Como aparece na lista."
        [maxlength]="10"
      />
    </form>
  `,
})
class TextHostComponent {
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(10)],
    }),
  });
}

async function setup() {
  const result = await render(TextHostComponent, { providers: [provideI18nTesting('pt')] });
  return {
    ...result,
    form: result.fixture.componentInstance.form,
    field: screen.getByTestId('name') as HTMLInputElement,
  };
}

describe('TextFieldComponent', () => {
  it('Dado o campo, quando digito, então o controle recebe o texto', async () => {
    const { form, field } = await setup();

    await userEvent.type(field, 'Nubank');

    expect(form.controls.name.value).toBe('Nubank');
  });

  it('Dado um valor no controle, então o campo o exibe e respeita o estado desabilitado', async () => {
    const { form, field, fixture } = await setup();

    form.controls.name.setValue('Itaú');
    form.controls.name.disable();
    fixture.detectChanges();

    expect(field.value).toBe('Itaú');
    expect(field).toBeDisabled();
  });

  it('Dado o campo vazio e ainda não tocado, então não mostra erro; depois de tocado, mostra e liga o aria-describedby', async () => {
    const { field, fixture } = await setup();
    expect(screen.queryByTestId(/-error$/)).not.toBeInTheDocument();

    await userEvent.click(field);
    await userEvent.tab();
    fixture.detectChanges();

    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId(/-error$/)).toHaveTextContent('Preencha este campo.');
    expect(field.getAttribute('aria-describedby')).toContain(
      screen.getByTestId(/-error$/).getAttribute('id') ?? 'x',
    );
  });

  it('Dado o limite de caracteres, então o campo traz o maxlength', async () => {
    const { field } = await setup();

    expect(field).toHaveAttribute('maxlength', '10');
  });

  it('Dado o campo, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado hideLabel, então o rótulo continua o nome acessível mas some da vista; autofocus marca o campo', async () => {
    const control = new FormControl('', { nonNullable: true });
    await render(
      `<app-text-field [formControl]="control" fieldId="busca" label="Buscar" [hideLabel]="true" [autofocus]="true" />`,
      {
        imports: [ReactiveFormsModule, TextFieldComponent],
        providers: [provideI18nTesting('pt')],
        componentProperties: { control },
      },
    );

    const input = screen.getByRole('textbox', { name: 'Buscar' });
    expect(screen.getByText('Buscar')).toHaveClass('visually-hidden');
    expect(input).toHaveAttribute('data-autofocus', '');
  });
});
