import { render } from '@testing-library/angular';

import { IconComponent } from '~/app/common/components/icon/icon.component';
import { ICONS, IconName } from '~/app/common/components/icon/icons';

describe('IconComponent', () => {
  it.each(Object.keys(ICONS) as IconName[])(
    'Dado o ícone %s, então é decorativo, de traço fino e usa currentColor',
    async (name) => {
      const { container } = await render(IconComponent, { inputs: { name } });

      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('stroke', 'currentColor');
      expect(svg).toHaveAttribute('stroke-width', '1.5');
      expect(svg?.querySelectorAll('path').length).toBe(ICONS[name].length);
    },
  );

  it('Dado um tamanho, então aplica largura e altura', async () => {
    const { container } = await render(IconComponent, { inputs: { name: 'home', size: 16 } });

    expect(container.querySelector('svg')).toHaveAttribute('width', '16');
  });

  it('Dado o conjunto de ícones (DS 00), então não há moeda, cifrão, banco, cofrinho, cadeado ou escudo', () => {
    const forbidden = /coin|dollar|money|bank|piggy|lock|shield|wallet|currency/i;
    expect(Object.keys(ICONS).filter((name) => forbidden.test(name))).toEqual([]);
  });
});
