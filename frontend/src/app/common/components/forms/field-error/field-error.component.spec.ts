import { FormControl, Validators } from '@angular/forms';
import { render, screen } from '@testing-library/angular';

import { FieldErrorComponent } from '~/app/common/components/forms/field-error/field-error.component';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup(control: FormControl, language: 'pt' | 'en' = 'pt') {
  const result = await render(FieldErrorComponent, {
    inputs: { control, errorId: 'f-error' },
    providers: [provideI18nTesting(language)],
  });
  return result;
}

describe('FieldErrorComponent', () => {
  it('Dado um controle inválido ainda não tocado, então não mostra o erro', async () => {
    await setup(new FormControl('', Validators.required));

    expect(screen.queryByTestId('f-error')).not.toBeInTheDocument();
  });

  it('Dado o controle tocado, então mostra a mensagem do i18n com o id para o aria-describedby', async () => {
    const control = new FormControl('', Validators.required);
    const { fixture } = await setup(control);

    control.markAsTouched();
    await fixture.whenStable();

    const error = screen.getByTestId('f-error');
    expect(error).toHaveTextContent('Preencha este campo.');
    expect(error).toHaveAttribute('id', 'f-error');
  });

  it('Dado o markAllAsTouched do salvar, então o erro aparece e some quando o valor fica válido', async () => {
    const control = new FormControl('', Validators.required);
    const { fixture } = await setup(control);

    control.markAllAsTouched();
    await fixture.whenStable();
    expect(screen.getByTestId('f-error')).toBeVisible();

    control.setValue('ok');
    await fixture.whenStable();
    expect(screen.queryByTestId('f-error')).not.toBeInTheDocument();
  });

  it('Dado o idioma en e um limite de caracteres, então a mensagem é traduzida e interpolada', async () => {
    const control = new FormControl('abcdef', Validators.maxLength(3));
    const { fixture } = await setup(control, 'en');

    control.markAsTouched();
    await fixture.whenStable();

    expect(screen.getByTestId('f-error')).toHaveTextContent('Use at most 3 characters.');
  });

  it('Dado um erro desconhecido, então usa a mensagem genérica', async () => {
    const control = new FormControl('x', () => ({ custom: true }));
    const { fixture } = await setup(control);

    control.markAsTouched();
    await fixture.whenStable();

    expect(screen.getByTestId('f-error')).toHaveTextContent('Valor inválido.');
  });
});
