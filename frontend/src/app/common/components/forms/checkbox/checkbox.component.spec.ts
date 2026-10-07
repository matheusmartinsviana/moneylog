import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { CheckboxComponent } from '~/app/common/components/forms/checkbox/checkbox.component';
import { SwitchComponent } from '~/app/common/components/forms/switch/switch.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({
  selector: 'app-choice-host',
  imports: [ReactiveFormsModule, CheckboxComponent, SwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-checkbox [formControl]="check" fieldId="check" label="Só estornadas" />
    <app-switch [formControl]="toggle" fieldId="toggle" label="Avisos" />
    <app-switch
      [formControl]="toggle"
      fieldId="toggle-state"
      label="Notificações"
      [showState]="true"
    />
  `,
})
class ChoiceHostComponent {
  readonly check = new FormControl(false, { nonNullable: true });
  readonly toggle = new FormControl(true, { nonNullable: true });
}

async function setup() {
  const result = await render(ChoiceHostComponent, { providers: [provideI18nTesting('pt')] });
  return { ...result, host: result.fixture.componentInstance };
}

describe('Checkbox e Switch', () => {
  it('Dado o checkbox, então tem papel checkbox, nome pelo rótulo e alterna por clique e Espaço', async () => {
    const { host } = await setup();
    const box = screen.getByRole('checkbox', { name: 'Só estornadas' });

    expect(box).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(box);
    expect(host.check.value).toBe(true);
    expect(box).toHaveAttribute('aria-checked', 'true');

    box.focus();
    await userEvent.keyboard(' ');
    expect(host.check.value).toBe(false);
  });

  it('Dado o controle desabilitado, então o checkbox não alterna', async () => {
    const { host } = await setup();
    host.check.disable();
    await userEvent.click(screen.getByTestId('check'));

    expect(host.check.value).toBe(false);
  });

  it('Dado o switch, então papel switch, estado em texto e alterna por Espaço', async () => {
    const { host } = await setup();
    const toggle = screen.getByRole('switch', { name: /Avisos/ });

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveTextContent('Ligado');
    toggle.focus();
    await userEvent.keyboard(' ');

    expect(host.toggle.value).toBe(false);
    expect(toggle).toHaveTextContent('Desligado');
  });

  it('Dado os dois, então o axe não aponta violações', async () => {
    const { container } = await setup();
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado o texto de estado visível, então ele não entra no nome acessível (o leitor diz o estado uma vez, por aria-checked)', async () => {
    await setup();

    const toggle = screen.getByTestId('toggle-state');

    expect(toggle).toHaveAccessibleName('Notificações');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle.querySelector('.switch__state')).toHaveAttribute('aria-hidden', 'true');
  });
});
