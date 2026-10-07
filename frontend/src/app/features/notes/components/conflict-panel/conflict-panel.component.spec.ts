import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import {
  ConflictPanelComponent,
  DIFF_PAGE,
} from '~/app/features/notes/components/conflict-panel/conflict-panel.component';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup(inputs: Record<string, unknown>) {
  return render(ConflictPanelComponent, {
    inputs: { remote: 'a', mine: 'b', ...inputs },
    providers: [provideI18nTesting('pt')],
  });
}

describe('ConflictPanelComponent', () => {
  it('Dado conflito de salvar, então oferece "Salvar o meu texto por cima"', async () => {
    await setup({ during: 'save' });

    expect(screen.getByTestId('conflict-keep-mine')).toBeInTheDocument();
  });

  it('Dado canKeepMine falso (rascunho limpo), então a opção destrutiva não existe e "Usar a do servidor" vira a primária (F4)', async () => {
    await setup({ during: 'links', canKeepMine: false });

    expect(screen.queryByTestId('conflict-keep-mine')).not.toBeInTheDocument();
    expect(screen.getByTestId('conflict-use-remote')).toHaveClass('button--primary');
  });

  it('Dado conflito ao vincular, então o texto fala do vínculo (não do texto digitado)', async () => {
    await setup({ during: 'links' });

    expect(screen.getByTestId('conflict-description')).toHaveTextContent('Antes de vincular');
  });

  it('Dado diferença enorme, então desenha só um bloco de linhas e "Mostrar mais" libera o próximo (F6)', async () => {
    const remote = Array.from({ length: 1000 }, (_, i) => `r${i}`).join('\n');
    const mine = Array.from({ length: 1000 }, (_, i) => `m${i}`).join('\n');
    const { container } = await setup({ remote, mine });

    await userEvent.click(screen.getByTestId('conflict-toggle-diff'));

    expect(container.querySelectorAll('.diff__line')).toHaveLength(DIFF_PAGE);
    expect(screen.getByTestId('conflict-diff-count')).toHaveTextContent(
      `Mostrando ${DIFF_PAGE} de 2000 linhas.`,
    );
    await userEvent.click(screen.getByTestId('conflict-diff-more'));
    expect(container.querySelectorAll('.diff__line')).toHaveLength(DIFF_PAGE * 2);
  });

  it('Dado 1 linha contra 200 mil linhas, então mostra "grande demais" sem desenhar linha nenhuma (F6)', async () => {
    const { container } = await setup({ remote: 'uma', mine: '\n'.repeat(200_000) });

    await userEvent.click(screen.getByTestId('conflict-toggle-diff'));

    expect(screen.getByTestId('conflict-diff-too-big')).toBeInTheDocument();
    expect(container.querySelectorAll('.diff__line')).toHaveLength(0);
  });
});
