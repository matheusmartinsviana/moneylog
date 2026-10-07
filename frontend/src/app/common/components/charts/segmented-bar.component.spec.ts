import { render, screen } from '@testing-library/angular';

import {
  SegmentedBarComponent,
  type SegmentedBarSegment,
} from '~/app/common/components/charts/segmented-bar.component';
import { pt } from '~/app/common/i18n/translations/pt';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

const segments: SegmentedBarSegment[] = [
  { id: 'food', label: 'Alimentação', share: '0.4000', valueText: 'R$ 820,00', tone: 'accent' },
  { id: 'rest', label: 'Outras', share: '0.1500', valueText: 'R$ 310,00', tone: 'warning' },
];

async function setup(disabled = false) {
  return render(SegmentedBarComponent, {
    inputs: { label: 'Orçamento', segments, disabled, cy: 'seg' },
    providers: [provideI18nTesting('pt')],
  });
}

describe('SegmentedBarComponent (T199)', () => {
  it('Dado segmentos já calculados, então desenha a largura de cada share e lista rótulo e valor em texto', async () => {
    await setup();

    const drawn = document.querySelectorAll<HTMLElement>('.sb__seg');
    expect(Array.from(drawn, (el) => el.style.width)).toEqual(['40%', '15%']);
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Orçamento: Alimentação R$ 820,00, Outras R$ 310,00',
    );
    expect(screen.getByTestId('seg-legend')).toHaveTextContent('Alimentação');
    expect(screen.getByTestId('seg-legend')).toHaveTextContent('R$ 310,00');
  });

  it('Dado o estado desabilitado, então a trilha fica vazia, sem número, com "disponível em breve"', async () => {
    await setup(true);

    expect(document.querySelectorAll('.sb__seg')).toHaveLength(0);
    expect(screen.queryByTestId('seg-legend')).not.toBeInTheDocument();
    expect(screen.getByTestId('seg-disabled')).toHaveTextContent(pt.charts.segmentedDisabled);
    expect(screen.getByTestId('seg')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('img')).toHaveAccessibleName(
      `Orçamento: ${pt.charts.segmentedDisabled}`,
    );
  });

  it.each([false, true])('Dado disabled=%s, então o axe não aponta violações', async (disabled) => {
    const { container } = await setup(disabled);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
