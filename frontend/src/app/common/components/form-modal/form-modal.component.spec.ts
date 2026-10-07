import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { FormModalComponent } from '~/app/common/components/form-modal/form-modal.component';
import { pt } from '~/app/common/i18n/translations/pt';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({
  selector: 'app-form-modal-host',
  imports: [FormModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-form-modal #modal heading="Nova conta" [dirty]="dirty()" (closed)="closed()">
      <button type="button" data-cy="inside" (click)="modal.requestClose()">Cancelar</button>
    </app-form-modal>
  `,
})
class HostComponent {
  readonly dirty = signal(false);
  readonly closed = vi.fn();
}

async function setup(dirty: boolean) {
  const result = await render(HostComponent, { providers: [provideI18nTesting('pt')] });
  result.fixture.componentInstance.dirty.set(dirty);
  result.fixture.detectChanges();
  return result;
}

describe('FormModalComponent', () => {
  it('Dado o formulário aberto, então é um diálogo nomeado pelo título e sem violações de a11y', async () => {
    const { container } = await setup(false);

    expect(screen.getByRole('dialog', { name: 'Nova conta' })).toBeInTheDocument();
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado sem alterações, quando aperto Esc, então fecha direto', async () => {
    const { fixture } = await setup(false);

    await userEvent.keyboard('{Escape}');

    expect(fixture.componentInstance.closed).toHaveBeenCalledTimes(1);
  });

  it('Dado alterações, quando aperto Esc, então pede para descartar e só fecha ao confirmar', async () => {
    const { fixture } = await setup(true);

    await userEvent.keyboard('{Escape}');
    expect(fixture.componentInstance.closed).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-dialog')).toHaveAccessibleName(pt.form.discard.title);

    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(fixture.componentInstance.closed).toHaveBeenCalledTimes(1);
  });
});
