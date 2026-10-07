import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { DatePickerComponent } from '~/app/common/components/forms/date-picker/date-picker.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({
  selector: 'app-date-host',
  imports: [ReactiveFormsModule, DatePickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-date-picker
    [formControl]="control"
    fieldId="date"
    label="Data"
    min="2026-01-01"
    max="2026-12-31"
  />`,
})
class DateHostComponent {
  readonly control = new FormControl<string | null>('2026-10-31');
}

async function setup(language: 'pt' | 'en' | 'es' = 'pt') {
  const result = await render(DateHostComponent, { providers: [provideI18nTesting(language)] });
  return {
    ...result,
    control: result.fixture.componentInstance.control,
    field: screen.getByTestId('date') as HTMLInputElement,
  };
}

describe('DatePickerComponent', () => {
  it('Dado um valor YYYY-MM-DD do modelo, então o campo o mostra com a máscara do idioma e o rótulo nomeia o campo', async () => {
    const { field } = await setup();

    expect(field).toHaveValue('31/10/2026');
    expect(field).toHaveAccessibleName('Data');
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveAttribute('inputmode', 'numeric');
  });

  it('Dado o idioma inglês, então a máscara é mm/dd/yyyy', async () => {
    const { field } = await setup('en');

    expect(field).toHaveValue('10/31/2026');
  });

  it('Dado que digito só os números, então a máscara põe as barras e o controle recebe YYYY-MM-DD', async () => {
    const { field, control } = await setup();

    await userEvent.clear(field);
    await userEvent.type(field, '05112026');

    expect(field).toHaveValue('05/11/2026');
    expect(control.value).toBe('2026-11-05');
    expect(control.valid).toBe(true);
  });

  it('Dado data incompleta ou inexistente (31/02), então o controle fica inválido e o erro só aparece depois de tocado', async () => {
    const { field, control } = await setup();

    await userEvent.clear(field);
    await userEvent.type(field, '3102');
    expect(control.errors).toEqual({ dateFormat: true });
    expect(screen.queryByText('Digite uma data válida.')).not.toBeInTheDocument();

    await userEvent.type(field, '2026');
    expect(control.value).toBeNull();
    expect(control.errors).toEqual({ dateFormat: true });
    await userEvent.tab();
    await userEvent.tab();
    expect(await screen.findByText('Digite uma data válida.')).toBeVisible();
  });

  it('Dado a data fora do intervalo, então o controle fica inválido', async () => {
    const { field, control } = await setup();

    await userEvent.clear(field);
    await userEvent.type(field, '01022027');

    expect(control.errors).toEqual({ dateMax: { max: '2026-12-31' } });
  });

  it('Dado o botão do calendário, então abre o diálogo com a grade, e clicar num dia escolhe a data e fecha', async () => {
    const { control } = await setup();

    await userEvent.click(screen.getByTestId('date-calendar'));
    expect(screen.getByRole('dialog', { name: 'Escolher data' })).toBeInTheDocument();
    expect(screen.getByRole('grid')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('date-cal-day-2026-10-15'));

    expect(control.value).toBe('2026-10-15');
    expect(screen.getByTestId('date')).toHaveValue('15/10/2026');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Dado que escolho um dia no calendário, então o campo já conta como tocado (sem esperar o próximo blur)', async () => {
    const { control } = await setup();
    expect(control.touched).toBe(false);

    await userEvent.click(screen.getByTestId('date-calendar'));
    await userEvent.click(screen.getByTestId('date-cal-day-2026-10-15'));

    expect(control.touched).toBe(true);
  });

  it('Dado o calendário aberto, então o dia tem rótulo completo e o dia escolhido é marcado', async () => {
    await setup();

    await userEvent.click(screen.getByTestId('date-calendar'));

    expect(screen.getByTestId('date-cal-day-2026-10-31')).toHaveAccessibleName(
      'sábado, 31 de outubro de 2026',
    );
    expect(screen.getByTestId('date-cal-day-2026-10-31').closest('td')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('Dado o foco na grade, então setas, PageDown e Enter navegam e escolhem, e Esc fecha sem alterar', async () => {
    const { control } = await setup();

    await userEvent.click(screen.getByTestId('date-calendar'));
    await vi.waitFor(() => expect(screen.getByTestId('date-cal-day-2026-10-31')).toHaveFocus());
    await userEvent.keyboard('{ArrowLeft}{ArrowUp}');
    expect(screen.getByTestId('date-cal-day-2026-10-23')).toHaveFocus();
    await userEvent.keyboard('{PageDown}');
    await vi.waitFor(() => expect(screen.getByTestId('date-cal-day-2026-11-23')).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    expect(control.value).toBe('2026-11-23');

    await userEvent.click(screen.getByTestId('date-calendar'));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(control.value).toBe('2026-11-23');
    await vi.waitFor(() => expect(screen.getByTestId('date-calendar')).toHaveFocus());
  });

  it('Dado dias fora do intervalo, então ficam desabilitados e não escolhem', async () => {
    const { control } = await setup();

    await userEvent.click(screen.getByTestId('date-calendar'));
    await userEvent.click(screen.getByTestId('date-cal-prev'));
    // 2026-01 é o primeiro mês permitido; 2025-12 não tem como entrar.
    for (let i = 0; i < 12; i++) {
      const prev = screen.getByTestId('date-cal-prev');
      if ((prev as HTMLButtonElement).disabled) break;
      await userEvent.click(prev);
    }
    expect(screen.getByTestId('date-cal-prev')).toBeDisabled();
    expect(control.value).toBe('2026-10-31');
  });

  it('Dado o campo e o calendário abertos, então o axe não aponta violações', async () => {
    await setup();
    await userEvent.click(screen.getByTestId('date-calendar'));

    const violations = await axeViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado o calendário aberto, quando aperto Tab, então fecha e o foco volta ao campo (não escapa para o navegador)', async () => {
    const { field } = await setup();

    await userEvent.click(screen.getByTestId('date-calendar'));
    await vi.waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await userEvent.tab();

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      document.activeElement === field ||
        screen.getByTestId('date-calendar') === document.activeElement,
    ).toBe(true);
  });

  it('Dado 31/10, quando escolho novembro na grade de meses, então o foco vai para 30/11 (último dia do mês)', async () => {
    await setup();

    await userEvent.click(screen.getByTestId('date-calendar'));
    await vi.waitFor(() => expect(screen.getByTestId('date-cal-title')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('date-cal-title'));
    await userEvent.click(screen.getByTestId('date-cal-months-2026-11'));

    await vi.waitFor(() => expect(screen.getByTestId('date-cal-day-2026-11-30')).toHaveFocus());
  });
});
