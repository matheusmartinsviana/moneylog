import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { NEVER, of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { CommitmentsPage } from '~/app/features/planning/pages/commitments.page';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { CommitmentsGatewayStub, provideCommitmentsStub } from '~/testing/commitments-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

vi.setConfig({ testTimeout: 30_000 });

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();

async function setup(gateway = new CommitmentsGatewayStub()) {
  const result = await render(CommitmentsPage, {
    providers: [provideI18nTesting('pt'), provideRouter([]), provideCommitmentsStub(gateway)],
  });
  await result.fixture.whenStable();
  return { ...result, gateway };
}

describe('CommitmentsPage', () => {
  it('Dado carregando, então mostra o esqueleto com status acessível', async () => {
    const gateway = new CommitmentsGatewayStub();
    gateway.list$ = NEVER;
    await setup(gateway);

    expect(screen.getByTestId('commitments-loading')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(pt.commitments.loading);
  });

  it('Dado o empréstimo de terceiro, então mostra o informado e nenhum saldo', async () => {
    await setup();

    const row = screen.getByTestId('commitment-row-c-loan');
    expect(text(screen.getByTestId('commitment-installments-c-loan'))).toBe(
      '4 de 12 parcelas pagas',
    );
    expect(text(row)).toContain('R$ 400,00');
    expect(screen.getByTestId('commitment-unknown-c-loan')).toHaveTextContent(
      pt.commitments.row.balanceUnknown,
    );
    expect(screen.queryByTestId('commitment-balance-c-loan')).not.toBeInTheDocument();
  });

  it('Dado o projeto, então mostra o saldo nominal e o progresso do servidor', async () => {
    await setup();

    expect(text(screen.getByTestId('commitment-balance-c-project'))).toContain('R$ 90.000,00');
    expect(text(screen.getByTestId('commitment-progress-c-project'))).toContain('10%');
    expect(screen.getByTestId('commitment-kind-c-project')).toHaveTextContent(
      pt.commitments.kinds.LONG_TERM_PROJECT,
    );
  });

  it('Dado nenhum compromisso, então mostra o vazio com a ação de cadastrar', async () => {
    const gateway = new CommitmentsGatewayStub();
    gateway.list$ = of({ items: [], hasNext: false });
    await setup(gateway);

    expect(screen.getByRole('heading', { name: pt.commitments.empty.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: pt.commitments.empty.action })).toHaveAttribute(
      'href',
      '/planning/commitments/new',
    );
  });

  it('Dado erro, então mostra o erro com "tentar de novo"', async () => {
    const gateway = new CommitmentsGatewayStub();
    gateway.list$ = failWith(0, 'NETWORK');
    await setup(gateway);

    expect(await screen.findByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
  });

  it('Dado a lista, então não tem violações de acessibilidade', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
