import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';

import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { axeViolations, describeViolations } from '~/testing/axe';

@Component({
  selector: 'app-host',
  imports: [PageLayoutComponent, SectionContainerComponent],
  template: `
    <app-page-layout heading="Cartões" description="Faturas e parcelas">
      <button pageActions type="button" data-cy="page-action">Ação</button>
      <app-section-container heading="Resumo" description="Calculado pelo backend.">
        <p>Conteúdo</p>
      </app-section-container>
    </app-page-layout>
  `,
})
class HostComponent {}

describe('PageLayoutComponent', () => {
  it('Dado título e conteúdo, então há um único h1 e um único landmark main', async () => {
    await render(HostComponent);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cartões');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByTestId('page-description')).toHaveTextContent('Faturas e parcelas');
    expect(screen.getByTestId('page-action')).toBeVisible();
  });

  it('Dado o SectionContainer, então é uma região nomeada pelo seu h2', async () => {
    await render(HostComponent);

    expect(screen.getByRole('region', { name: 'Resumo' })).toHaveTextContent('Conteúdo');
    expect(screen.getByText('Calculado pelo backend.')).toBeVisible();
  });

  it('Dado a página montada, então o axe não aponta violações', async () => {
    const { container } = await render(HostComponent);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado uma página sem descrição, então não renderiza o parágrafo', async () => {
    await render(PageLayoutComponent, { inputs: { heading: 'Início' } });

    expect(screen.queryByTestId('page-description')).not.toBeInTheDocument();
  });
});
