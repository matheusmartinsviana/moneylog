import { provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { throwError } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import {
  FeaturedGoalComponent,
  type FeaturedGoalStatus,
  SLIDER_INTERVAL_MS,
} from '~/app/features/home/components/featured-goal/featured-goal.component';
import type { Goal } from '~/modules/goals/core/types/goal';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aDreamGoal,
  aGoal,
  aMetricGoal,
  GoalPhotosGatewayStub,
  GoalsGatewayStub,
  provideGoalsStub,
} from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup(
  goals: readonly Goal[],
  status: FeaturedGoalStatus = 'ready',
  photos = new GoalPhotosGatewayStub(),
) {
  const retry = vi.fn();
  const result = await render(FeaturedGoalComponent, {
    inputs: { goals, status },
    on: { retry },
    providers: [
      provideI18nTesting('pt'),
      provideRouter([]),
      provideGoalsStub(new GoalsGatewayStub(), photos),
    ],
  });
  result.fixture.detectChanges();
  return { ...result, retry, photos };
}

/** Avança o relógio falso e deixa o Angular desenhar o que mudou. */
async function tick(fixture: { detectChanges: () => void }, ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  fixture.detectChanges();
}

const alt = () => screen.getByTestId('home-featured-goal-photo').getAttribute('alt');
const slider = () => screen.getByTestId('home-featured-goal-slider');
const live = () => slider().querySelector('[aria-live]')?.getAttribute('aria-live');

describe('FeaturedGoalComponent', () => {
  let created = 0;
  beforeEach(() => {
    created = 0;
    URL.createObjectURL = vi.fn(() => `blob:sintetico-${++created}`);
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('dados do servidor', () => {
    it('Dado a meta em destaque, então mostra nome, preço, selo do degrau e o progresso que o servidor devolveu', async () => {
      await setup([aDreamGoal(0, { stage: 'STRATEGY', progress: '0.2500' })]);

      expect(screen.getByTestId('home-featured-goal-open')).toHaveTextContent('Carro de exemplo');
      expect(screen.getByTestId('home-featured-goal-open')).toHaveAttribute(
        'href',
        '/goals/goal-dream',
      );
      expect(screen.getByTestId('home-featured-goal-price')).toHaveTextContent('10.000,00');
      expect(screen.getByTestId('home-featured-goal-stage')).toHaveTextContent('Estratégia');
      expect(screen.getByTestId('home-featured-goal-percent')).toHaveTextContent('25%');
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    });

    it('Dado uma meta inteligente sem nome, então usa o nome gerado pela medida', async () => {
      await setup([aMetricGoal({ name: null })]);

      expect(screen.getByTestId('home-featured-goal-open')).toHaveTextContent(
        /Total de dívidas até/,
      );
    });

    it('Dado progresso acima de 100%, então a barra para em 100% e o texto diz o que o servidor disse', async () => {
      await setup([aGoal({ progress: '1.2000' })]);

      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
      expect(screen.getByTestId('home-featured-goal-percent')).toHaveTextContent('120%');
    });

    it('Dado nenhuma meta em destaque, então convida a marcar uma, sem número', async () => {
      await setup([]);

      expect(screen.getByTestId('home-featured-goal-empty')).toHaveTextContent(
        pt.brief.featuredGoal.empty,
      );
      expect(screen.getByTestId('home-featured-goal-choose')).toHaveAttribute('href', '/goals');
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('Dado carregando, então só o status acessível; dado erro, então "tentar de novo" emite retry', async () => {
      const { fixture, retry } = await setup([], 'loading');
      expect(screen.getByRole('status')).toHaveTextContent(pt.goals.loading);

      fixture.componentRef.setInput('status', 'error');
      fixture.detectChanges();
      await userEvent.click(screen.getByTestId('home-featured-goal-retry'));

      expect(retry).toHaveBeenCalledTimes(1);
    });
  });

  describe('fotos', () => {
    it('Dado a meta sem fotos, então mostra só o progresso, sem slider nem controles', async () => {
      await setup([aDreamGoal(0)]);

      expect(screen.queryByTestId('home-featured-goal-slider')).not.toBeInTheDocument();
      expect(screen.queryByTestId('home-featured-goal-toggle')).not.toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('Dado uma foto só, então mostra a foto sem controles de slider', async () => {
      await setup([aDreamGoal(1)]);

      expect(alt()).toBe('Foto 1 de 1 da meta Carro de exemplo');
      expect(screen.queryByTestId('home-featured-goal-prev')).not.toBeInTheDocument();
      expect(screen.queryByTestId('home-featured-goal-next')).not.toBeInTheDocument();
      expect(screen.queryByTestId('home-featured-goal-toggle')).not.toBeInTheDocument();
      expect(screen.queryByTestId('home-featured-goal-dots')).not.toBeInTheDocument();
    });

    it('Dado a falha ao carregar a foto, então o nome, o preço e o progresso continuam e a foto oferece tentar de novo', async () => {
      const photos = new GoalPhotosGatewayStub();
      photos.content$ = throwError(() => new Error('rede'));
      await setup([aDreamGoal(2)], 'ready', photos);

      expect(screen.getByTestId('home-featured-goal-photo-error')).toHaveTextContent(
        pt.goals.photos.unavailable,
      );
      expect(screen.getByTestId('home-featured-goal-open')).toHaveTextContent('Carro de exemplo');
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByTestId('home-featured-goal-photo-retry')).toBeInTheDocument();
    });
  });

  describe('slider automático', () => {
    beforeEach(() => vi.useFakeTimers());

    it('Dado três fotos, então avança sozinho a cada 5 s, volta ao início no fim e mantém aria-live desligado', async () => {
      const { fixture } = await setup([aDreamGoal(3)]);

      expect(SLIDER_INTERVAL_MS).toBe(5000);
      expect(alt()).toBe('Foto 1 de 3 da meta Carro de exemplo');
      expect(live()).toBe('off');
      await tick(fixture, 4999);
      expect(alt()).toBe('Foto 1 de 3 da meta Carro de exemplo');
      await tick(fixture, 1);
      expect(alt()).toBe('Foto 2 de 3 da meta Carro de exemplo');
      expect(screen.getByTestId('home-featured-goal-dot-1')).toHaveAttribute(
        'aria-current',
        'true',
      );
      await tick(fixture, 5000);
      expect(alt()).toBe('Foto 3 de 3 da meta Carro de exemplo');
      await tick(fixture, 5000);
      expect(alt()).toBe('Foto 1 de 3 da meta Carro de exemplo');
    });

    it('Dado o autoplay, então pré-carrega só a próxima foto', async () => {
      const { fixture, photos } = await setup([aDreamGoal(3)]);

      expect([...photos.contentCalls].sort()).toEqual([
        'goal-dream/photo-1/thumb',
        'goal-dream/photo-2/thumb',
      ]);
      await tick(fixture, 5000);
      expect(photos.contentCalls).toContain('goal-dream/photo-3/thumb');
      expect(photos.contentCalls.filter((call) => call.includes('photo-1'))).toHaveLength(1);
    });

    it('Dado o botão de pausa, então ele é visível, pausa e reproduz de novo, trocando o rótulo', async () => {
      const { fixture } = await setup([aDreamGoal(3)]);
      const toggle = screen.getByTestId('home-featured-goal-toggle');
      expect(toggle).toHaveAccessibleName(pt.brief.featuredGoal.pause);

      fireEvent.click(toggle);
      fixture.detectChanges();
      expect(toggle).toHaveAccessibleName(pt.brief.featuredGoal.play);
      expect(live()).toBe('polite');
      await tick(fixture, 20_000);
      expect(alt()).toBe('Foto 1 de 3 da meta Carro de exemplo');

      fireEvent.click(toggle);
      fixture.detectChanges();
      await tick(fixture, 5000);
      expect(alt()).toBe('Foto 2 de 3 da meta Carro de exemplo');
    });

    it('Dado o mouse em cima, então pausa e retoma ao sair', async () => {
      const { fixture } = await setup([aDreamGoal(3)]);

      fireEvent.mouseEnter(slider());
      fixture.detectChanges();
      await tick(fixture, 20_000);
      expect(alt()).toBe('Foto 1 de 3 da meta Carro de exemplo');

      fireEvent.mouseLeave(slider());
      fixture.detectChanges();
      await tick(fixture, 5000);
      expect(alt()).toBe('Foto 2 de 3 da meta Carro de exemplo');
    });

    it('Dado o toque, então pausa enquanto toca e retoma ao soltar', async () => {
      const { fixture } = await setup([aDreamGoal(3)]);

      fireEvent.touchStart(slider());
      fixture.detectChanges();
      await tick(fixture, 20_000);
      expect(alt()).toBe('Foto 1 de 3 da meta Carro de exemplo');

      fireEvent.touchEnd(slider());
      fixture.detectChanges();
      await tick(fixture, 5000);
      expect(alt()).toBe('Foto 2 de 3 da meta Carro de exemplo');
    });

    it('Dado o foco dentro do slider, então pausa; ao sair do foco para fora dele, retoma', async () => {
      const { fixture } = await setup([aDreamGoal(3)]);

      fireEvent.focusIn(screen.getByTestId('home-featured-goal-next'));
      fixture.detectChanges();
      await tick(fixture, 20_000);
      expect(alt()).toBe('Foto 1 de 3 da meta Carro de exemplo');

      fireEvent.focusOut(screen.getByTestId('home-featured-goal-next'), {
        relatedTarget: document.body,
      });
      fixture.detectChanges();
      await tick(fixture, 5000);
      expect(alt()).toBe('Foto 2 de 3 da meta Carro de exemplo');
    });

    it('Dado a aba oculta, então o timer para e volta quando a aba reaparece', async () => {
      const { fixture } = await setup([aDreamGoal(3)]);
      const visibility = vi.spyOn(document, 'visibilityState', 'get');

      visibility.mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      fixture.detectChanges();
      await tick(fixture, 20_000);
      expect(alt()).toBe('Foto 1 de 3 da meta Carro de exemplo');

      visibility.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      fixture.detectChanges();
      await tick(fixture, 5000);
      expect(alt()).toBe('Foto 2 de 3 da meta Carro de exemplo');
      visibility.mockRestore();
    });

    it('Dado teclado, quando uso próxima e anterior, então navega, o autoplay pausa com o foco e o anúncio vira polite', async () => {
      const { fixture } = await setup([aDreamGoal(3)]);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await user.tab();
      expect(screen.getByTestId('home-featured-goal-prev')).toHaveFocus();
      await user.keyboard('{Enter}');
      fixture.detectChanges();
      expect(alt()).toBe('Foto 3 de 3 da meta Carro de exemplo');
      await user.tab();
      await user.keyboard('{Enter}');
      fixture.detectChanges();
      expect(alt()).toBe('Foto 1 de 3 da meta Carro de exemplo');
      expect(live()).toBe('polite');
      await tick(fixture, 20_000);
      expect(alt()).toBe('Foto 1 de 3 da meta Carro de exemplo');
    });

    it('Dado um indicador, então leva direto à foto e marca aria-current', async () => {
      const { fixture } = await setup([aDreamGoal(3)]);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await user.click(screen.getByTestId('home-featured-goal-dot-2'));
      fixture.detectChanges();

      expect(alt()).toBe('Foto 3 de 3 da meta Carro de exemplo');
      expect(screen.getByTestId('home-featured-goal-dot-2')).toHaveAttribute(
        'aria-current',
        'true',
      );
      expect(screen.getByTestId('home-featured-goal-dot-2')).toHaveAccessibleName(
        'Ver a foto 3 de 3',
      );
    });
  });

  describe('movimento reduzido', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      );
    });

    it('Dado prefers-reduced-motion, então não há autoplay nem botão de pausa e a navegação é manual', async () => {
      const { fixture } = await setup([aDreamGoal(3)]);

      await tick(fixture, 30_000);
      expect(alt()).toBe('Foto 1 de 3 da meta Carro de exemplo');
      expect(screen.queryByTestId('home-featured-goal-toggle')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('home-featured-goal-next'));
      fixture.detectChanges();
      expect(alt()).toBe('Foto 2 de 3 da meta Carro de exemplo');
      expect(live()).toBe('polite');
    });
  });

  it('Dado o slider, então não há violações de acessibilidade', async () => {
    const { container } = await setup([aDreamGoal(3)]);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
