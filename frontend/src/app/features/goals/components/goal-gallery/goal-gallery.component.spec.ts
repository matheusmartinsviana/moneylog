import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { GoalGalleryComponent } from '~/app/features/goals/components/goal-gallery/goal-gallery.component';
import type { GoalPhoto } from '~/modules/goals/core/types/goal';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aGoalPhoto,
  GoalPhotosGatewayStub,
  GoalsGatewayStub,
  provideGoalsStub,
} from '~/testing/goals-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

const photos = (n: number): GoalPhoto[] =>
  Array.from({ length: n }, (_, i) => aGoalPhoto({ id: `photo-${i + 1}`, position: i }));

async function setup(list: readonly GoalPhoto[]) {
  const gateway = new GoalPhotosGatewayStub();
  const result = await render(GoalGalleryComponent, {
    inputs: { goalId: 'goal-dream', goalName: 'Carro de exemplo', photos: list },
    providers: [provideI18nTesting('pt'), provideGoalsStub(new GoalsGatewayStub(), gateway)],
  });
  return { ...result, gateway };
}

const bigAlt = () => screen.getByTestId('goal-gallery-image').getAttribute('alt');

describe('GoalGalleryComponent', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:sintetico');
    URL.revokeObjectURL = vi.fn();
  });

  it('Dado fotos, então mostra a grande (versão de exibição) com alt descritivo e as miniaturas', async () => {
    const { gateway } = await setup(photos(3));

    expect(bigAlt()).toBe('Foto 1 de 3 da meta Carro de exemplo');
    expect(gateway.contentCalls).toContain('goal-dream/photo-1/display');
    expect(gateway.contentCalls).toContain('goal-dream/photo-3/thumb');
    expect(screen.getByTestId('goal-gallery-thumb-0')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('goal-gallery-thumb-1')).not.toHaveAttribute('aria-current');
  });

  it('Dado uma miniatura, então troca a foto grande e marca aria-current', async () => {
    await setup(photos(3));

    await userEvent.click(screen.getByTestId('goal-gallery-thumb-2'));

    expect(bigAlt()).toBe('Foto 3 de 3 da meta Carro de exemplo');
    expect(screen.getByTestId('goal-gallery-thumb-2')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('goal-gallery-announce')).toHaveAttribute('aria-live', 'polite');
  });

  it('Dado o teclado, então setas, Home e End navegam e a lista dá a volta', async () => {
    await setup(photos(3));
    screen.getByTestId('goal-gallery-viewer').focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(bigAlt()).toBe('Foto 2 de 3 da meta Carro de exemplo');
    await userEvent.keyboard('{End}');
    expect(bigAlt()).toBe('Foto 3 de 3 da meta Carro de exemplo');
    await userEvent.keyboard('{ArrowRight}');
    expect(bigAlt()).toBe('Foto 1 de 3 da meta Carro de exemplo');
    await userEvent.keyboard('{ArrowLeft}');
    expect(bigAlt()).toBe('Foto 3 de 3 da meta Carro de exemplo');
    await userEvent.keyboard('{Home}');
    expect(bigAlt()).toBe('Foto 1 de 3 da meta Carro de exemplo');
  });

  it('Dado os botões anterior e próxima, então navegam e são alcançáveis por Tab', async () => {
    await setup(photos(2));

    await userEvent.click(screen.getByTestId('goal-gallery-next'));
    expect(bigAlt()).toBe('Foto 2 de 2 da meta Carro de exemplo');
    await userEvent.click(screen.getByTestId('goal-gallery-prev'));
    expect(bigAlt()).toBe('Foto 1 de 2 da meta Carro de exemplo');
  });

  it('Dado uma foto só, então sem setas nem miniaturas', async () => {
    await setup(photos(1));

    expect(bigAlt()).toBe('Foto 1 de 1 da meta Carro de exemplo');
    expect(screen.queryByTestId('goal-gallery-next')).not.toBeInTheDocument();
    expect(screen.queryByTestId('goal-gallery-thumbs')).not.toBeInTheDocument();
  });

  it('Dado a foto atual removida, então volta para uma posição válida', async () => {
    const { fixture } = await setup(photos(3));
    await userEvent.click(screen.getByTestId('goal-gallery-thumb-2'));

    fixture.componentRef.setInput('photos', photos(2));
    fixture.detectChanges();

    expect(bigAlt()).toBe('Foto 2 de 2 da meta Carro de exemplo');
  });

  it('Dado a galeria, então não há violações de acessibilidade', async () => {
    const { container } = await setup(photos(3));

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
