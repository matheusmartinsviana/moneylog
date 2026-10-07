import { render, screen } from '@testing-library/angular';

import { SparklineComponent } from '~/app/features/planning/components/sparkline/sparkline.component';
import { axeViolations, describeViolations } from '~/testing/axe';

const points = (id: string) => screen.getByTestId(`sparkline-${id}`).getAttribute('points') ?? '';

describe('SparklineComponent', () => {
  it('Dado uma série, então desenha uma polilinha com um ponto por valor, só escala visual', async () => {
    await render(SparklineComponent, {
      inputs: { series: [{ id: 'base', values: ['100.00', '300.00', '200.00'] }] },
    });

    const coordinates = points('base').split(' ');
    expect(coordinates).toHaveLength(3);
    // Maior valor = mais alto (y menor).
    const y = coordinates.map((c) => Number(c.split(',')[1]));
    expect(y[1]).toBeLessThan(y[0]!);
    expect(y[1]).toBeLessThan(y[2]!);
    expect(document.querySelectorAll('circle')).toHaveLength(3);
  });

  it('Dado uma tendência mais curta, então alinha pelo mês (chaves) e não pelo índice', async () => {
    await render(SparklineComponent, {
      inputs: {
        series: [
          { id: 'base', keys: ['2026-10', '2026-11', '2026-12'], values: ['1', '2', '3'] },
          { id: 'trend', keys: ['2026-11', '2026-12'], values: ['2', '3'], dashed: true },
        ],
      },
    });

    const x = (id: string) =>
      points(id)
        .split(' ')
        .map((c) => Number(c.split(',')[0]));
    expect(x('trend')).toEqual(x('base').slice(1));
  });

  it('Dado a tendência (dashed), então a linha é tracejada: a leitura não depende só de cor', async () => {
    await render(SparklineComponent, {
      inputs: {
        series: [
          { id: 'base', values: ['1.00', '2.00'] },
          { id: 'trend', values: ['1.00', '1.50'], dashed: true },
        ],
      },
    });

    expect(screen.getByTestId('sparkline-trend')).toHaveClass('spark__line--dashed');
    expect(screen.getByTestId('sparkline-base')).not.toHaveClass('spark__line--dashed');
  });

  it('Dado valores que atravessam o zero, então desenha a linha do zero', async () => {
    await render(SparklineComponent, {
      inputs: { series: [{ id: 'base', values: ['-100.00', '100.00'] }] },
    });

    expect(document.querySelector('.spark__zero')).not.toBeNull();
  });

  it('Dado todos os valores iguais ou um ponto só, então centraliza sem dividir por zero', async () => {
    await render(SparklineComponent, {
      inputs: { series: [{ id: 'base', values: ['50.00'] }] },
    });

    expect(points('base')).not.toContain('NaN');
  });

  it('Dado série sem valores, então não desenha nada nem quebra', async () => {
    await render(SparklineComponent, { inputs: { series: [] } });

    expect(screen.getByTestId('sparkline')).toBeInTheDocument();
    expect(document.querySelectorAll('polyline')).toHaveLength(0);
  });

  it('Dado a sparkline, então é decorativa para leitor de tela e não tem violações', async () => {
    const { container } = await render(SparklineComponent, {
      inputs: { series: [{ id: 'base', values: ['1.00', '2.00'] }] },
    });

    expect(screen.getByTestId('sparkline')).toHaveAttribute('aria-hidden', 'true');
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
