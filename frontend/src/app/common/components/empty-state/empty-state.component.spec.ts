import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import {
  EmptyStateAction,
  EmptyStateComponent,
  EmptyStateIllustration,
} from '~/app/common/components/empty-state/empty-state.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup(actions: readonly EmptyStateAction[], illustration?: EmptyStateIllustration) {
  const onAction = vi.fn();
  const result = await render(EmptyStateComponent, {
    inputs: {
      heading: 'Nenhum cartão cadastrado.',
      description: 'Cadastre um cartão para acompanhar faturas.',
      actions,
      ...(illustration ? { illustration } : {}),
    },
    on: { action: onAction },
    providers: [provideI18nTesting('pt'), provideRouter([])],
  });
  return { ...result, onAction };
}

describe('EmptyStateComponent', () => {
  it('Dado uma ação indisponível, então o botão fica disabled, com aria-disabled, data-cy e a dica "disponível em breve"', async () => {
    const { onAction } = await setup([
      { id: 'add-card', label: 'Adicionar cartão', available: false },
    ]);

    const button = screen.getByTestId('empty-state-action-add-card');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Disponível em breve');
    expect(screen.getByTestId('empty-state-coming-soon')).toHaveTextContent('Disponível em breve');

    await userEvent.click(button);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('Dado uma ação disponível, quando clico, então emite o id da ação', async () => {
    const { onAction } = await setup([{ id: 'retry', label: 'Tentar de novo', available: true }]);

    const button = screen.getByRole('button', { name: 'Tentar de novo' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByTestId('empty-state-coming-soon')).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(onAction).toHaveBeenCalledExactlyOnceWith('retry');
  });

  it('Dado uma ação com link, então renderiza um link de navegação', async () => {
    await setup([{ id: 'go-home', label: 'Ir para o início', available: true, link: '/' }]);

    expect(screen.getByRole('link', { name: 'Ir para o início' })).toHaveAttribute('href', '/');
  });

  it('Dado título e texto, então mostra o título como h2 que nomeia a seção', async () => {
    await setup([]);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Nenhum cartão cadastrado.' }),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: 'Nenhum cartão cadastrado.' })).toBeInTheDocument();
    expect(screen.getByText('Cadastre um cartão para acompanhar faturas.')).toBeVisible();
  });

  it.each<EmptyStateIllustration>(['log', 'grid', 'timeline', 'document'])(
    'Dado a ilustração %s, então é SVG abstrato decorativo com currentColor e sem cor fixa',
    async (illustration) => {
      const { container } = await setup([], illustration);

      const svg = container.querySelector('.empty__illustration svg');
      expect(svg).not.toBeNull();
      expect(svg?.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(svg?.getAttribute('stroke')).toBe('currentColor');
      expect(svg?.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|<image|<text/i);
    },
  );

  it('Dado o componente com ações, então o axe não aponta violações', async () => {
    const { container } = await setup([
      { id: 'a', label: 'Adicionar conta', available: false, primary: true },
      { id: 'b', label: 'Importar extrato', available: true },
    ]);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
