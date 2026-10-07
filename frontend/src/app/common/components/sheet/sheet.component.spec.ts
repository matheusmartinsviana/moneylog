import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

@Component({
  selector: 'app-sheet-host',
  imports: [SheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <button type="button" data-cy="trigger" (click)="open.set(true)">Filtros</button>
      <app-sheet heading="Filtros" [open]="open()" [desktop]="desktop()" (closed)="open.set(false)">
        <button type="button" data-cy="apply" data-autofocus>Aplicar</button>
      </app-sheet>
    </main>
  `,
})
class SheetHostComponent {
  readonly open = signal(false);
  readonly desktop = signal<'center' | 'side'>('center');
}

function compact(matches: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function setup(desktop: 'center' | 'side' = 'center') {
  const result = await render(SheetHostComponent, { providers: [provideI18nTesting('pt')] });
  result.fixture.componentInstance.desktop.set(desktop);
  const trigger = screen.getByTestId('trigger');
  await userEvent.click(trigger);
  await result.fixture.whenStable();
  return { ...result, trigger };
}

describe('SheetComponent', () => {
  afterEach(() => {
    document.body.removeAttribute('style');
    vi.unstubAllGlobals();
  });

  it('Dado tela compacta, então é uma folha inferior modal com botão Fechar e foco no autofoco', async () => {
    compact(true);
    await setup();

    const panel = screen.getByRole('dialog', { name: 'Filtros' });
    expect(panel).toHaveAttribute('data-side', 'sheet');
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('apply')).toHaveFocus();
  });

  it('Dado tela larga, então é um painel central ou lateral conforme o parâmetro', async () => {
    compact(false);
    await setup('side');

    expect(screen.getByTestId('sheet-panel')).toHaveAttribute('data-side', 'side');
  });

  it('Dado Fechar, então fecha e o foco volta ao gatilho', async () => {
    compact(true);
    const { trigger } = await setup();

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(trigger).toHaveFocus());
  });

  it('Dado a folha aberta, então o axe não aponta violações', async () => {
    compact(true);
    await setup();

    const violations = await axeViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
