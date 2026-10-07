import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { MonthPickerComponent } from '~/app/common/components/forms/month-picker/month-picker.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({
  selector: 'app-month-host',
  imports: [ReactiveFormsModule, MonthPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-month-picker
    [formControl]="control"
    fieldId="month"
    label="Competência"
    [min]="min()"
    [max]="max()"
    [mandatory]="mandatory()"
  />`,
})
class HostComponent {
  readonly control = new FormControl<string | null>('2026-10');
  readonly min = signal<string | undefined>(undefined);
  readonly max = signal<string | undefined>(undefined);
  readonly mandatory = signal(true);
}

async function setup() {
  const result = await render(HostComponent, { providers: [provideI18nTesting('pt')] });
  return { ...result, control: result.fixture.componentInstance.control };
}

describe('MonthPickerComponent', () => {
  it('Dado o valor YYYY-MM, então o gatilho mostra o mês por extenso e tem nome acessível', async () => {
    await setup();

    expect(screen.getByTestId('month')).toHaveTextContent(/outubro de 2026/i);
    expect(screen.getByRole('button', { name: /Competência/ })).toBeInTheDocument();
  });

  it('Dado o clique, então abre a grade de meses e escolher um mês atualiza o controle e fecha', async () => {
    const { control } = await setup();

    await userEvent.click(screen.getByTestId('month'));
    expect(screen.getByRole('dialog', { name: 'Escolher mês' })).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('month-grid-2026-03'));

    expect(control.value).toBe('2026-03');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Dado o teclado, então setas movem o mês, PageDown muda o ano, Enter escolhe e Esc fecha', async () => {
    const { control } = await setup();

    await userEvent.click(screen.getByTestId('month'));
    await vi.waitFor(() => expect(screen.getByTestId('month-grid-2026-10')).toHaveFocus());
    await userEvent.keyboard('{ArrowLeft}{PageDown}');
    await vi.waitFor(() => expect(screen.getByTestId('month-grid-2027-09')).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    expect(control.value).toBe('2027-09');

    await userEvent.click(screen.getByTestId('month'));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(control.value).toBe('2027-09');
  });

  it('Dado aberto, então o axe não aponta violações', async () => {
    await setup();
    await userEvent.click(screen.getByTestId('month'));

    const violations = await axeViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado min e max, quando o valor está fora da faixa, então o controle fica inválido com monthMin/monthMax', async () => {
    const { control, fixture } = await setup();
    fixture.componentInstance.min.set('2026-03');
    fixture.componentInstance.max.set('2026-11');
    fixture.detectChanges();

    control.setValue('2026-02');
    expect(control.errors).toEqual({ monthMin: { min: '2026-03' } });
    control.setValue('2026-12');
    expect(control.errors).toEqual({ monthMax: { max: '2026-11' } });
    control.setValue('2026-05');
    expect(control.errors).toBeNull();
  });

  it('Dado o seletor opcional, quando clico em Limpar, então o valor vira null e o painel fecha', async () => {
    const { control, fixture } = await setup();
    fixture.componentInstance.mandatory.set(false);
    fixture.detectChanges();

    await userEvent.click(screen.getByTestId('month'));
    await userEvent.click(screen.getByTestId('month-clear'));

    expect(control.value).toBeNull();
    expect(control.valid).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Dado o seletor obrigatório, então não oferece Limpar', async () => {
    await setup();

    await userEvent.click(screen.getByTestId('month'));

    expect(screen.queryByTestId('month-clear')).not.toBeInTheDocument();
  });

  it('Dado o painel aberto, quando aperto Tab, então fecha e o foco volta ao gatilho', async () => {
    await setup();

    await userEvent.click(screen.getByTestId('month'));
    await vi.waitFor(() => expect(screen.getByTestId('month-grid-2026-10')).toHaveFocus());
    await userEvent.tab();

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('month')).toHaveFocus();
  });
});
