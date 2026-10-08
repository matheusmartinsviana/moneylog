import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ThirdPartiesPage } from '~/app/features/planning/pages/third-parties.page';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  aReceivables,
  anEmptyReceivables,
  provideThirdPartiesStub,
  ThirdPartiesGatewayStub,
} from '~/testing/third-parties-testing';

vi.setConfig({ testTimeout: 30_000 });

const text = (el: HTMLElement) =>
  el.textContent
    ?.replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();

async function setup(gateway = new ThirdPartiesGatewayStub()) {
  const result = await render(ThirdPartiesPage, {
    providers: [provideI18nTesting('pt'), provideRouter([]), provideThirdPartiesStub(gateway)],
  });
  await result.fixture.whenStable();
  return { ...result, gateway };
}

describe('ThirdPartiesPage', () => {
  it('Dado carregando, então mostra o esqueleto com status acessível e nenhum valor', async () => {
    const gateway = new ThirdPartiesGatewayStub();
    gateway.receivables$ = NEVER;
    await setup(gateway);

    expect(screen.getByTestId('third-parties-loading')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(pt.thirdParties.loading);
    expect(screen.queryByTestId('tp-total')).not.toBeInTheDocument();
  });

  it('Dado valores a receber, então mostra total, pessoa e itens exatamente como o servidor devolveu', async () => {
    const { gateway } = await setup();

    expect(gateway.gets).toEqual([null]);
    expect(text(screen.getByTestId('tp-total-pending'))).toContain('R$ 700,00');
    expect(text(screen.getByTestId('tp-total-owed'))).toBe('R$ 800,00');
    expect(text(screen.getByTestId('tp-total-received'))).toBe('R$ 100,00');
    expect(text(screen.getByTestId('tp-person-pending-person-1'))).toBe('R$ 700,00');
    expect(text(screen.getByTestId('tp-item-tx-tp-1'))).toContain('Presente de aniversário');
    expect(text(screen.getByTestId('tp-item-tx-tp-1'))).toContain(
      pt.thirdParties.people.source.EXPENSE,
    );
    expect(text(screen.getByTestId('tp-item-debt-tp-1'))).toContain(
      pt.thirdParties.people.source.DEBT,
    );
  });

  it('Dado o bloco do mês, então mostra bruto, terceiros e líquido do servidor, separado do total a receber', async () => {
    await setup();

    expect(text(screen.getByTestId('tp-gross'))).toBe('R$ 3.200,00');
    expect(text(screen.getByTestId('tp-third-party'))).toBe('R$ 300,00');
    expect(text(screen.getByTestId('tp-reimbursed'))).toBe('R$ 100,00');
    expect(text(screen.getByTestId('tp-net'))).toBe('R$ 3.100,00');
    expect(screen.getByTestId('tp-total')).not.toContainElement(screen.getByTestId('tp-gross'));
    expect(screen.getByTestId('tp-total')).toHaveTextContent(pt.thirdParties.total.note);
  });

  it('Dado ninguém a receber e mês sem gasto, então mostra o estado vazio com ação', async () => {
    const gateway = new ThirdPartiesGatewayStub();
    gateway.receivables$ = of(anEmptyReceivables());
    await setup(gateway);

    expect(screen.getByRole('heading', { name: pt.thirdParties.empty.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: pt.thirdParties.empty.action })).toHaveAttribute(
      'href',
      '/transactions',
    );
  });

  it('Dado ninguém a receber mas gasto no mês, então diz que não há pessoas e mantém o bloco do mês', async () => {
    const gateway = new ThirdPartiesGatewayStub();
    gateway.receivables$ = of(aReceivables({ people: [] }));
    await setup(gateway);

    expect(screen.getByTestId('tp-people-empty')).toHaveTextContent(pt.thirdParties.people.none);
    expect(screen.getByTestId('tp-gross')).toBeInTheDocument();
  });

  it('Dado erro, então mostra o erro e "tentar de novo" recarrega', async () => {
    const gateway = new ThirdPartiesGatewayStub();
    gateway.receivables$ = failWith(0, 'NETWORK');
    await setup(gateway);

    gateway.receivables$ = null;
    await userEvent.click(await screen.findByRole('button', { name: /tentar de novo/i }));

    expect(await screen.findByTestId('tp-total')).toBeInTheDocument();
    expect(gateway.gets).toHaveLength(2);
  });

  it('Dado a tela pronta, então não tem violações de acessibilidade', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
