import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import {
  LineChartComponent,
  type LineChartKey,
  type LineChartSeries,
} from '~/app/common/components/charts/line-chart.component';
import { pt } from '~/app/common/i18n/translations/pt';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

const brl = (amount: string) => ({ amount, currency: 'BRL' });
const keys: LineChartKey[] = ['10/10', '11/10', '12/10', '13/10', '14/10'].map((label) => ({
  id: label,
  label: `Dia ${label}`,
  shortLabel: label,
}));
const income: LineChartSeries = {
  id: 'income',
  label: 'Entradas',
  tone: 'primary',
  values: ['100.00', '2500.00', '0.00', '400.00', '5500.00'].map(brl),
};
const expenses: LineChartSeries = {
  id: 'expenses',
  label: 'Saídas',
  tone: 'secondary',
  values: ['50.00', '-35.50', '120.00', '0.00', '300.00'].map(brl),
};

async function setup(inputs: Partial<{ series: LineChartSeries[]; keys: LineChartKey[] }> = {}) {
  const result = await render(LineChartComponent, {
    inputs: {
      label: 'Entradas e saídas',
      series: [income, expenses],
      keys,
      cy: 'chart',
      ...inputs,
    },
    providers: [provideI18nTesting('pt')],
  });
  const plot = screen.queryByTestId('chart-plot');
  return { ...result, plot };
}

describe('LineChartComponent (T198)', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('Dado duas séries, então desenha as curvas e a área sólida sem gradiente', async () => {
    await setup();

    expect(screen.getByTestId('chart-line-income').getAttribute('d')).toMatch(/^M[\d. -]+C/);
    expect(screen.getByTestId('chart-line-expenses')).toHaveClass('lc__line--secondary');
    expect(screen.getByTestId('chart-area-income')).toBeInTheDocument();
    // Só a série primária tem área por padrão.
    expect(screen.queryByTestId('chart-area-expenses')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/gradient\(/i);
    expect(screen.getByTestId('chart-legend')).toHaveTextContent('Entradas');
    expect(screen.getByTestId('chart-legend')).toHaveTextContent('Saídas');
  });

  it('Dado o eixo Y, então mostra o máximo e, só com valor negativo, o mínimo (texto do backend) e o zero', async () => {
    await setup({ series: [income] });

    expect(screen.getByTestId('chart-y-max')).toHaveTextContent('R$ 5.500,00');
    expect(screen.getByTestId('chart-y-zero')).toHaveTextContent('0');
    expect(screen.queryByTestId('chart-y-min')).not.toBeInTheDocument();
    // Nada de "tick bonito" inventado: nenhum outro número no eixo.
    expect(document.querySelectorAll('.lc__y')).toHaveLength(2);
  });

  it('Dado valor negativo, então o menor valor ganha rótulo na escala (BUG-QA-11)', async () => {
    await setup();

    expect(screen.getByTestId('chart-y-min')).toHaveTextContent('−R$ 35,50');
    const min = Number.parseFloat((screen.getByTestId('chart-y-min') as HTMLElement).style.top);
    const zero = Number.parseFloat((screen.getByTestId('chart-y-zero') as HTMLElement).style.top);
    expect(min).toBeGreaterThan(zero);
  });

  it('Dado só valores negativos, então o zero fica no topo e o menor valor é rotulado embaixo', async () => {
    await setup({
      series: [{ ...expenses, values: ['-10.00', '-80.00', '-30.00', '-5.00', '-20.00'].map(brl) }],
    });

    expect(screen.queryByTestId('chart-y-max')).not.toBeInTheDocument();
    expect(screen.getByTestId('chart-y-min')).toHaveTextContent('−R$ 80,00');
    expect(screen.getByTestId('chart-y-zero')).toBeInTheDocument();
  });

  it('Dado o gráfico, então há role="img" com resumo e o grupo focável tem nome e dica de teclado', async () => {
    await setup();

    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Entradas e saídas: Entradas, Saídas, 5 pontos.',
    );
    const plot = screen.getByRole('group', { name: 'Entradas e saídas' });
    expect(plot).toHaveAttribute('tabindex', '0');
    expect(plot).toHaveAccessibleDescription(pt.charts.keyboardHint);
  });

  it('Dado o foco no gráfico, quando aperto →, então o ponto ativo avança e o tooltip mostra rótulo e valores', async () => {
    await setup();
    const plot = screen.getByTestId('chart-plot');

    await userEvent.tab();
    expect(plot).toHaveFocus();
    expect(screen.queryByTestId('chart-tooltip')).not.toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('Dia 10/10');
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('R$ 100,00');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('Dia 11/10');
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('R$ 2.500,00');
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('−R$ 35,50');
    // O tooltip é próprio (não é o atributo `title`) e fica fora da árvore de acessibilidade.
    expect(screen.getByTestId('chart-tooltip')).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('[title]')).toBeNull();
  });

  it('Dado o teclado, então Home e End vão às pontas, ← parte do fim e Esc esconde', async () => {
    await setup();
    await userEvent.tab();

    await userEvent.keyboard('{End}');
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('Dia 14/10');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('Dia 14/10'); // não passa da ponta
    await userEvent.keyboard('{Home}');
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('Dia 10/10');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('chart-tooltip')).not.toBeInTheDocument();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('Dia 14/10');
  });

  it('Dado o teclado, então a região viva polite anuncia o ponto ativo', async () => {
    await setup();
    await userEvent.tab();

    await userEvent.keyboard('{ArrowRight}');

    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    await vi.waitFor(() =>
      expect(live!.textContent?.replaceAll('\u00a0', ' ')).toContain(
        'Dia 10/10: Entradas R$ 100,00, Saídas R$ 50,00',
      ),
    );
  });

  it('Dado o ponteiro, quando passo o mouse, então o tooltip acompanha; ao sair, some (e no toque fica)', async () => {
    await setup();
    const plot = screen.getByTestId('chart-plot');
    plot.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 200, width: 500, height: 200 }) as DOMRect;

    await userEvent.pointer({ target: plot, coords: { clientX: 10, clientY: 50 } });
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('Dia 10/10');
    await userEvent.pointer({ target: plot, coords: { clientX: 495, clientY: 50 } });
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('Dia 14/10');
    await userEvent.unhover(plot);
    expect(screen.queryByTestId('chart-tooltip')).not.toBeInTheDocument();
  });

  it('Dado o gráfico, então a área de toque deixa a rolagem vertical da página livre (touch-action: pan-y)', async () => {
    await setup();

    // O estilo é do CSS do componente; o jsdom não o avalia, então confere a regra na folha de estilos.
    const css = Array.from(document.querySelectorAll('style'), (style) => style.textContent).join(
      '',
    );
    expect(css).toMatch(/touch-action:\s*pan-y/);
  });

  it('Dado a tabela equivalente, então existe sempre no DOM (caption, th scope) e o botão a mostra', async () => {
    await setup();

    const table = screen.getByRole('table', { name: 'Entradas e saídas', hidden: true });
    expect(table.querySelector('caption')).toHaveTextContent('Entradas e saídas');
    expect(table.querySelectorAll('thead th[scope="col"]')).toHaveLength(3);
    expect(table.querySelectorAll('tbody th[scope="row"]')).toHaveLength(5);
    expect(within(table).getByText('−R$ 35,50')).toBeInTheDocument();
    const wrapper = screen.getByTestId('chart-table');
    expect(wrapper).toHaveClass('visually-hidden');

    const toggle = screen.getByTestId('chart-table-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', wrapper.id);
    await userEvent.click(toggle);
    expect(wrapper).not.toHaveClass('visually-hidden');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent(pt.charts.hideTable);
  });

  it('Dado valor negativo (dia só com reembolso), então desenha abaixo do zero e o sinal aparece no tooltip e na tabela', async () => {
    await setup({ series: [expenses] });

    // O zero fica acima do fundo do gráfico (há espaço abaixo para o negativo): a linha do zero não é a última.
    const zeroTop = Number.parseFloat(
      (screen.getByTestId('chart-y-zero') as HTMLElement).style.top,
    );
    expect(zeroTop).toBeLessThan(95);
    expect(screen.getByTestId('chart-y-max')).toHaveTextContent('R$ 300,00');
    expect(screen.getByRole('table', { hidden: true })).toHaveTextContent('−R$ 35,50');
  });

  it('Dado série vazia ou só de zeros, então mostra o estado vazio honesto, sem linha fingindo dado', async () => {
    await setup({
      series: [{ ...income, values: keys.map(() => brl('0.00')) }],
    });

    expect(screen.getByTestId('chart-empty')).toHaveTextContent(pt.charts.empty);
    expect(screen.queryByTestId('chart-plot')).not.toBeInTheDocument();
    expect(document.querySelector('path')).toBeNull();
  });

  it('Dado nenhum ponto, então também é o estado vazio', async () => {
    await setup({ series: [{ ...income, values: [] }], keys: [] });

    expect(screen.getByTestId('chart-empty')).toBeInTheDocument();
  });

  it('Dado um único ponto, então só um marcador (sem curva)', async () => {
    await setup({
      series: [{ ...income, values: [brl('500.00')] }],
      keys: keys.slice(0, 1),
    });

    expect(screen.queryByTestId('chart-line-income')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.lc__dot')).toHaveLength(1);
  });

  it('Dado o estado final, então já está no DOM sem esperar a animação (sem IntersectionObserver)', async () => {
    await setup();

    expect(document.querySelector('.lc__svg')).not.toHaveClass('is-pending');
    expect(screen.getByTestId('chart-line-income')).toBeInTheDocument();
  });

  it('Dado o IntersectionObserver, então o traço é revelado uma vez só ao entrar na viewport', async () => {
    let callback: IntersectionObserverCallback = () => undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    try {
      await setup();
      expect(document.querySelector('.lc__svg')).toHaveClass('is-pending');

      callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      await vi.waitFor(() =>
        expect(document.querySelector('.lc__svg')).not.toHaveClass('is-pending'),
      );
      expect(disconnect).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Dado prefers-reduced-motion, então aparece completo, sem esperar a viewport', async () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    try {
      await setup();
      expect(document.querySelector('.lc__svg')).not.toHaveClass('is-pending');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Dado os idiomas, então os textos do gráfico vêm das traduções', async () => {
    await render(LineChartComponent, {
      inputs: { label: 'Income and expenses', series: [income], keys, cy: 'chart' },
      providers: [provideI18nTesting('en')],
    });

    expect(screen.getByTestId('chart-table-toggle')).toHaveTextContent('View as table');
  });

  it('Dado o gráfico, então o axe não aponta violações (tabela aberta e fechada)', async () => {
    const { container } = await setup();
    let violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);

    await userEvent.click(screen.getByTestId('chart-table-toggle'));
    violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado um toque que vira rolagem (pointercancel), então o tooltip fecha (M4)', async () => {
    await setup();
    const plot = screen.getByTestId('chart-plot');
    plot.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 200, width: 500, height: 200 }) as DOMRect;
    await userEvent.pointer({ target: plot, coords: { clientX: 10, clientY: 50 } });
    expect(screen.getByTestId('chart-tooltip')).toBeInTheDocument();

    plot.dispatchEvent(new Event('pointercancel', { bubbles: true }));

    await vi.waitFor(() => expect(screen.queryByTestId('chart-tooltip')).not.toBeInTheDocument());
  });

  it('Dado o tooltip aberto, então tocar fora do gráfico o fecha e tocar dentro não (M4)', async () => {
    await setup();
    const plot = screen.getByTestId('chart-plot');
    plot.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 200, width: 500, height: 200 }) as DOMRect;
    await userEvent.pointer({ target: plot, coords: { clientX: 10, clientY: 50 } });
    expect(screen.getByTestId('chart-tooltip')).toBeInTheDocument();

    plot.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(screen.getByTestId('chart-tooltip')).toBeInTheDocument();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await vi.waitFor(() => expect(screen.queryByTestId('chart-tooltip')).not.toBeInTheDocument());
  });

  it('Dado rótulos do eixo X, então cada marca tem largura máxima para não se sobrepor às vizinhas (BUG-QA-08)', async () => {
    await setup({
      keys: keys.map((key) => ({ ...key, shortLabel: `Competência de referência ${key.label}` })),
    });

    const widths = [...document.querySelectorAll<HTMLElement>('.lc__tick')].map((tick) =>
      Number.parseFloat(tick.style.maxWidth),
    );
    // 4 marcas (pontos 1, 2, 4 e 5): o menor vão é de ~24,6% e cada rótulo ocupa no máximo 2/3 dele (16%).
    expect(widths).toHaveLength(4);
    expect(widths.every((w) => w > 0 && w <= 16)).toBe(true);
  });

  it('Dado um único ponto, então o gráfico é baixo (não gasta a altura de uma série) (BUG-QA-11)', async () => {
    await setup({ series: [{ ...income, values: [brl('500.00')] }], keys: keys.slice(0, 1) });

    expect(screen.getByTestId('chart-plot')).toHaveClass('lc__plot--single');
  });
});
