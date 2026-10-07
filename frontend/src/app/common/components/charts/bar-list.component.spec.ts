import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';

import {
  BarListComponent,
  type BarListItem,
} from '~/app/common/components/charts/bar-list.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

const brl = (amount: string) => ({ amount, currency: 'BRL' });
const items: BarListItem[] = [
  { id: 'food', label: 'Alimentação', amount: brl('820.00'), share: '0.2007' },
  { id: 'transport', label: 'Transporte', amount: brl('420.00'), share: '0.1028' },
];

async function setup(
  inputs: Partial<{
    items: BarListItem[];
    other: { amount: ReturnType<typeof brl>; share: string | null; categories: number } | null;
  }> = {},
  language: 'pt' | 'en' | 'es' = 'pt',
) {
  return render(BarListComponent, {
    inputs: { items, cy: 'bars', ...inputs },
    providers: [provideI18nTesting(language)],
  });
}

describe('BarListComponent (T199)', () => {
  it('Dado os itens, então é uma lista semântica com valor e percentual em texto', async () => {
    await setup();

    const list = screen.getByRole('list');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Alimentação');
    expect(rows[0]).toHaveTextContent('R$ 820,00');
    expect(rows[0]).toHaveTextContent('20,1%');
    expect(rows[1]).toHaveTextContent('10,3%');
  });

  it('Dado a barra, então é aria-hidden e proporcional ao share (posicionamento, sem aritmética)', async () => {
    await setup();

    const fills = document.querySelectorAll<HTMLElement>('.bl__fill');
    expect(fills).toHaveLength(2);
    expect(fills[0]!.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(fills[0]!.style.width).toBe('20.07%');
    expect(fills[1]!.style.width).toBe('10.28%');
  });

  it('Dado share nulo, então esconde a barra e o percentual, mas mantém o valor', async () => {
    await setup({ items: [{ ...items[0]!, share: null }] });

    expect(document.querySelector('.bl__track')).toBeNull();
    expect(screen.getByRole('listitem')).toHaveTextContent('R$ 820,00');
    expect(screen.getByRole('listitem')).not.toHaveTextContent('%');
  });

  it('Dado "outras", então aparece como o último item com a contagem de categorias', async () => {
    await setup({ other: { amount: brl('175.50'), share: '0.0430', categories: 2 } });

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[2]).toHaveTextContent('Outras (2 categorias)');
    expect(rows[2]).toHaveTextContent('R$ 175,50');
    expect(rows[2]).toHaveTextContent('4,3%');
  });

  it('Dado "outras" com uma categoria, então usa o singular; em en e es, as traduções', async () => {
    await setup({ other: { amount: brl('9.00'), share: '0.0100', categories: 1 } });
    expect(screen.getByTestId('bars-item-other')).toHaveTextContent('Outras (1 categoria)');
  });

  it.each([
    ['en', 'Other (3 categories)'],
    ['es', 'Otras (3 categorías)'],
  ] as const)('Dado o idioma %s, então "outras" diz "%s"', async (language, text) => {
    await setup({ other: { amount: brl('9.00'), share: '0.0100', categories: 3 } }, language);
    expect(screen.getByTestId('bars-item-other')).toHaveTextContent(text);
  });

  it('Dado valor negativo, então o item usa o tom de risco e o sinal vem em texto', async () => {
    await setup({
      items: [{ id: 'refund', label: 'Reembolso', amount: brl('-35.50'), share: null }],
    });

    const row = screen.getByTestId('bars-item-refund');
    expect(row).toHaveClass('is-negative');
    expect(row).toHaveTextContent('−R$ 35,50');
  });

  it('Dado a lista, então o axe não aponta violações', async () => {
    const { container } = await setup({
      other: { amount: brl('1.00'), share: '0.0001', categories: 2 },
    });

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado um item com link, então o rótulo é um link com nome acessível e a "Outras" não é link', async () => {
    await render(BarListComponent, {
      inputs: {
        items: [
          {
            ...items[0]!,
            link: {
              commands: ['/transactions'],
              queryParams: { view: 'entries', categoryId: 'c1' },
              label: 'Ver movimentações de Alimentação',
            },
          },
        ],
        other: { amount: brl('50.00'), share: '0.0500', categories: 2 },
        cy: 'bars',
      },
      providers: [provideI18nTesting('pt'), provideRouter([])],
    });

    const link = screen.getByTestId('bars-link-food');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/transactions?view=entries&categoryId=c1');
    expect(link).toHaveAccessibleName('Ver movimentações de Alimentação');
    expect(screen.queryByTestId('bars-link-other')).not.toBeInTheDocument();
  });
});
