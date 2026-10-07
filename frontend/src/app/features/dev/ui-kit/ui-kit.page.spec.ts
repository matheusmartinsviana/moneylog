import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { UiKitPage } from '~/app/features/dev/ui-kit/ui-kit.page';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import { provideBusinessModules } from '~/testing/modules-testing';

const COMPONENTS = [
  'select',
  'text',
  'textarea',
  'filepicker',
  'chip',
  'money',
  'date',
  'month',
  'seg',
  'radio',
  'stepper',
  'tabs',
  'progress',
  'menu',
  'check',
  'switch',
  'disclosure',
  'tooltip',
  'overlays',
  'states',
  'charts',
];

describe('UiKitPage', () => {
  async function setup() {
    return render(UiKitPage, { providers: [provideI18nTesting('pt'), provideBusinessModules()] });
  }

  it('Dado a página, então mostra cada componente de base nos dois temas', async () => {
    await setup();

    for (const scope of ['light', 'dark']) {
      const kit = screen.getByTestId(`kit-${scope}`);
      expect(kit).toHaveAttribute('data-theme-scope', scope);
      for (const name of COMPONENTS) {
        expect(within(kit).getByTestId(`${scope}-${name}`), `${scope} ${name}`).toBeInTheDocument();
      }
    }
  }, 60_000);

  it('Dado os controles com estado, então padrão, foco, desabilitado, erro, cheio e vazio existem', async () => {
    await setup();
    const select = screen.getByTestId('light-select');

    for (const state of ['default', 'focus', 'disabled', 'error', 'full', 'empty']) {
      expect(within(select).getByTestId(`light-select-${state}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('light-select-disabled')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('light-select-error')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('light-switch-disabled-off')).toBeDisabled();
    expect(screen.getByTestId('light-date-error')).toHaveAttribute('aria-invalid', 'true');
  }, 60_000);

  it('Dado os novos componentes, então cada estado existe (RadioGroup, NumberStepper, Tabs, ProgressBar, Menu)', async () => {
    await setup();

    expect(screen.getByTestId('light-radio-disabled')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('light-radio-error')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('light-stepper-default')).toHaveAttribute('aria-valuenow', '6');
    expect(screen.getByTestId('light-stepper-disabled')).toBeDisabled();
    expect(screen.getByTestId('light-stepper-error')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('light-stepper-full')).toHaveAttribute('aria-valuenow', '36');
    expect(screen.getByTestId('light-tabs-default-tab-limit')).toBeInTheDocument();
    expect(screen.getByTestId('light-tabs-full-tab-t10')).toBeInTheDocument();
    for (const state of ['default', 'warning', 'risk', 'empty', 'busy', 'hidden']) {
      expect(screen.getByTestId(`light-progress-${state}-track`)).toHaveAttribute(
        'role',
        'progressbar',
      );
    }
    expect(screen.getByTestId('light-progress-busy-track')).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByTestId('light-menu-disabled')).toBeDisabled();
    expect(screen.getByTestId('light-menu-full')).toHaveAttribute('aria-haspopup', 'menu');
  }, 60_000);

  it('Dado os botões de Dialog e Sheet, então abrem o diálogo, o alerta e a folha', async () => {
    await setup();

    await userEvent.click(screen.getByTestId('light-open-dialog-basic'));
    expect(screen.getByRole('dialog', { name: 'Nova compra parcelada' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('light-open-dialog-alert'));
    expect(
      screen.getByRole('alertdialog', { name: 'Descartar as alterações?' }),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('light-dialog-alert-discard'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('light-open-sheet'));
    expect(screen.getByRole('dialog', { name: 'Filtros' })).toBeInTheDocument();
  }, 60_000);

  it('Dado o botão do diálogo, então abre o diálogo de confirmação', async () => {
    await setup();

    await userEvent.click(screen.getByTestId('light-open-dialog'));

    expect(screen.getByRole('dialog', { name: 'Arquivar a conta?' })).toBeInTheDocument();
  }, 60_000);

  it('Dado a página, então o axe não aponta violações', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
    // O axe percorre a página inteira da ui-kit (DOM grande): sob carga passou de 3 minutos.
  }, 240_000);
});
