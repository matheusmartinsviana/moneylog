import { render, screen } from '@testing-library/angular';

import {
  ProgressBarComponent,
  ProgressTone,
} from '~/app/common/components/progress-bar/progress-bar.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup(
  inputs: {
    value?: number | null;
    valueText?: string;
    tone?: ProgressTone;
    hideLabel?: boolean;
  } = {},
) {
  return render(ProgressBarComponent, {
    inputs: { label: 'Limite usado', fieldId: 'limit', ...inputs },
    providers: [provideI18nTesting('pt')],
  });
}

describe('ProgressBarComponent', () => {
  it('Dado um valor do backend, então é um progressbar nomeado com aria-valuenow em 0 a 100 e o texto formatado', async () => {
    await setup({ value: 0.62, valueText: 'R$ 1.240,00 de R$ 2.000,00' });

    const bar = screen.getByRole('progressbar', { name: 'Limite usado' });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '62');
    expect(bar).toHaveAttribute('aria-valuetext', 'R$ 1.240,00 de R$ 2.000,00');
    expect(screen.getByText('R$ 1.240,00 de R$ 2.000,00')).toBeVisible();
    expect(screen.getByTestId('limit-track').firstElementChild).toHaveStyle({ width: '62%' });
  });

  it.each([
    [-0.5, '0'],
    [0, '0'],
    [1, '100'],
    [1.7, '100'],
  ])('Dado %s, então limita a barra de 0 a 100 (%s)', async (value, now) => {
    await setup({ value });

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', now);
  });

  it('Dado valor sem texto, então o leitor de tela recebe a porcentagem', async () => {
    await setup({ value: 0.4 });

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '40%');
  });

  it.each([
    ['warning', 'Atenção'],
    ['risk', 'Risco'],
  ] as const)(
    'Dado a variante %s, então o estado aparece em texto e no aria-valuetext, nunca só em cor',
    async (tone, status) => {
      await setup({ value: 0.9, valueText: '90% do limite', tone });

      expect(screen.getByText(status)).toBeVisible();
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuetext',
        `${status}: 90% do limite`,
      );
      expect(screen.getByTestId('limit')).toHaveAttribute('data-tone', tone);
    },
  );

  it('Dado value=null, então é indeterminado: sem aria-valuenow, ocupado e com a animação', async () => {
    await setup({ value: null, valueText: 'Importando' });

    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).toHaveAttribute('aria-busy', 'true');
    expect(bar).toHaveAttribute('aria-valuetext', 'Importando');
    expect(bar.firstElementChild).toHaveClass('progress__fill--indeterminate');
  });

  it('Dado hideLabel, então o rótulo continua sendo o nome acessível', async () => {
    await setup({ value: 0.5, hideLabel: true });

    expect(screen.getByRole('progressbar', { name: 'Limite usado' })).toBeInTheDocument();
    expect(screen.getByText('Limite usado')).toHaveClass('visually-hidden');
  });

  it('Dado a barra, então nunca usa <progress> nem <meter>', async () => {
    const { container } = await setup({ value: 0.3 });

    expect(container.querySelector('progress, meter')).toBeNull();
  });

  it('Dado a variante de aviso, então o axe não aponta violações', async () => {
    const { container } = await setup({ value: 0.7, valueText: '70%', tone: 'warning' });

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado o indeterminado, então o axe não aponta violações', async () => {
    const { container } = await setup({ value: null });

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
