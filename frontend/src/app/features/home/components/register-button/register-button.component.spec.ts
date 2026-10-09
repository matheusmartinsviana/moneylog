import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { RegisterButtonComponent } from '~/app/features/home/components/register-button/register-button.component';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup(language: 'pt' | 'en' = 'pt') {
  const result = await render(RegisterButtonComponent, {
    providers: [provideI18nTesting(language), provideRouter([])],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  return { ...result, navigate };
}

describe('RegisterButtonComponent', () => {
  it('Dado o botão, então "Registrar" leva ao Novo registro (o modal da sidebar)', async () => {
    await setup();

    expect(screen.getByTestId('home-register-open')).toHaveTextContent('Registrar');
    expect(screen.getByTestId('home-register-open')).toHaveAttribute('href', '/quick-add');
  });

  it('Dado o menu, então oferece receita, compra no cartão e "Emprestei", que abrem o modal no tipo escolhido', async () => {
    const { navigate } = await setup();

    await userEvent.click(screen.getByTestId('home-register-menu'));
    expect(screen.getAllByRole('menuitem').map((entry) => entry.textContent?.trim())).toEqual([
      'Receita',
      'Crédito',
      'Emprestei',
    ]);
    await userEvent.click(screen.getByTestId('home-register-menu-item-loan'));

    expect(navigate).toHaveBeenCalledWith(['/quick-add'], { queryParams: { mode: 'loan' } });
  });

  it('Dado o inglês, então o rótulo vem traduzido', async () => {
    await setup('en');

    expect(screen.getByTestId('home-register-open')).toHaveTextContent('Add entry');
  });

  it('Dado o botão, então não há violações de acessibilidade', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
