import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { ProjectionsPage } from '~/app/features/planning/pages/projections.page';
import { failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import {
  aProjection,
  ProjectionsGatewayStub,
  provideProjectionsStub,
} from '~/testing/etapa5-testing';
import { provideI18nTesting } from '~/testing/i18n-testing';

vi.setConfig({ testTimeout: 30_000 });

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

async function setup(
  gateway = new ProjectionsGatewayStub(),
  inputs: { horizon?: string; trend?: string } = {},
) {
  const result = await render(ProjectionsPage, {
    inputs,
    providers: [provideI18nTesting('pt'), provideRouter([]), provideProjectionsStub(gateway)],
  });
  await result.fixture.whenStable();
  return { ...result, gateway, router: TestBed.inject(Router) };
}

describe('ProjectionsPage', () => {
  it('Dado qualquer horizonte, então o topo diz "Projeção, não certeza"', async () => {
    await setup();

    expect(screen.getByTestId('projection-banner-title')).toHaveTextContent(
      'Projeção, não certeza.',
    );
    expect(screen.getByTestId('projection-banner')).toHaveAttribute('role', 'note');
  });

  it('Dado a projeção M6 (padrão), então a tabela mostra os valores do backend e o último ponto diz até que dia vai', async () => {
    const { gateway } = await setup();

    expect(gateway.queries).toEqual([{ horizon: 'M6', includeTrend: false }]);
    expect(text(screen.getByTestId('projection-inflows-2026-11'))).toBe('R$ 3.000,00');
    expect(text(screen.getByTestId('projection-outflows-2026-11'))).toBe('R$ 1.402,00');
    expect(text(screen.getByTestId('projection-balance-2026-11'))).toBe('R$ 21.598,00');
    expect(text(screen.getByTestId('projection-until-2026-12'))).toBe('Até 31 de dezembro de 2026');
    expect(text(screen.getByTestId('projection-start'))).toContain('R$ 20.000,00');
  });

  it('Dado a tabela, então é uma <table> com legenda e cabeçalhos de coluna e de linha (leitura acessível da sparkline)', async () => {
    await setup();

    const table = screen.getByTestId('projection-table');
    expect(table.tagName).toBe('TABLE');
    expect(table.querySelector('caption')).not.toBeNull();
    expect(table.querySelectorAll('thead th[scope="col"]')).toHaveLength(4);
    expect(table.querySelectorAll('tbody th[scope="row"]')).toHaveLength(3);
    expect(screen.getByTestId('sparkline')).toHaveAttribute('aria-hidden', 'true');
  });

  it('Dado as premissas, então lista as traduzidas e as desconhecidas ganham um texto honesto', async () => {
    const gateway = new ProjectionsGatewayStub();
    gateway.result = (query) =>
      of(
        aProjection({
          horizon: query.horizon,
          assumptions: ['ACTIVE_RECURRENCES', 'NOVA_PREMISSA'],
        }),
      );
    await setup(gateway);

    expect(text(screen.getByTestId('projection-assumption-ACTIVE_RECURRENCES'))).toBe(
      'Recorrências ativas.',
    );
    expect(text(screen.getByTestId('projection-assumption-NOVA_PREMISSA'))).toBe(
      pt.projections.assumptionUnknown,
    );
  });

  it('Dado as quatro premissas do backend, então todas aparecem em português', async () => {
    await setup();

    for (const key of [
      'ACTIVE_RECURRENCES',
      'REGISTERED_INVOICES_AND_INSTALLMENTS',
      'DEBTS_WITH_EXPECTED_DATE',
      'NO_NEW_SPENDING_TREND',
    ]) {
      expect(screen.getByTestId(`projection-assumption-${key}`)).toBeInTheDocument();
    }
  });

  it('Dado o horizonte na URL, então a requisição usa esse horizonte e o controle o mostra marcado', async () => {
    const { gateway } = await setup(new ProjectionsGatewayStub(), { horizon: 'D90' });

    expect(gateway.queries[0]).toEqual({ horizon: 'D90', includeTrend: false });
    expect(screen.getByTestId('projection-horizon-D90')).toHaveAttribute('aria-checked', 'true');
  });

  it('Dado horizonte inválido na URL, então usa o padrão M6', async () => {
    const { gateway } = await setup(new ProjectionsGatewayStub(), { horizon: 'X' });

    expect(gateway.queries[0]?.horizon).toBe('M6');
  });

  it('Dado escolher outro horizonte, então a URL muda (F5 restaura) e o padrão sai da URL', async () => {
    const { router } = await setup();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await userEvent.click(screen.getByTestId('projection-horizon-M12'));

    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { horizon: 'M12', trend: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('Dado ligar a tendência, então a URL leva trend=1', async () => {
    const { router } = await setup();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await userEvent.click(screen.getByTestId('projection-trend'));

    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { horizon: null, trend: '1' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('Dado trend=1 com histórico, então a tendência aparece separada e rotulada "estimativa", e a base não muda', async () => {
    const gateway = new ProjectionsGatewayStub();
    gateway.result = (query) =>
      of(
        aProjection({
          horizon: query.horizon,
          trend: {
            available: true,
            estimate: true,
            reason: null,
            monthlyAverage: { amount: '900.00', currency: 'BRL' },
            basedOn: ['2026-07', '2026-08', '2026-09'],
            series: [
              {
                competence: '2026-11',
                estimatedSpending: { amount: '900.00', currency: 'BRL' },
                balance: { amount: '20698.00', currency: 'BRL' },
              },
            ],
          },
        }),
      );
    const { gateway: g } = await setup(gateway, { trend: '1' });

    expect(g.queries[0]?.includeTrend).toBe(true);
    expect(screen.getByTestId('projection-trend')).toHaveAttribute('aria-checked', 'true');
    expect(text(screen.getByTestId('projection-trend-estimate'))).toBe('Estimativa');
    expect(text(screen.getByTestId('projection-trend-average'))).toContain('R$ 900,00');
    expect(text(screen.getByTestId('projection-trend-based-on'))).toBe(
      'Com base em julho de 2026, agosto de 2026, setembro de 2026',
    );
    expect(text(screen.getByTestId('projection-trend-row-2026-11'))).toContain('R$ 20.698,00');
    // A base continua a mesma.
    expect(text(screen.getByTestId('projection-balance-2026-11'))).toBe('R$ 21.598,00');
    expect(screen.getByTestId('sparkline-trend')).toBeInTheDocument();
    expect(screen.getByTestId('sparkline-base')).toBeInTheDocument();
  });

  it('Dado tendência indisponível (INSUFFICIENT_HISTORY), então mostra o motivo e nenhuma média inventada', async () => {
    const gateway = new ProjectionsGatewayStub();
    gateway.result = (query) =>
      of(
        aProjection({
          horizon: query.horizon,
          trend: {
            available: false,
            estimate: true,
            reason: 'INSUFFICIENT_HISTORY',
            monthlyAverage: null,
            basedOn: [],
            series: [],
          },
        }),
      );
    await setup(gateway, { trend: '1' });

    expect(screen.getByTestId('projection-trend-unavailable')).toHaveTextContent(
      pt.projections.trend.reasons['INSUFFICIENT_HISTORY']!,
    );
    expect(screen.queryByTestId('projection-trend-average')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sparkline-trend')).not.toBeInTheDocument();
  });

  it('Dado as metas, então só informa o reservado e diz que a reserva não é saída', async () => {
    await setup();

    expect(screen.getByTestId('projection-goals-note')).toHaveTextContent(
      pt.projections.goals.note,
    );
    expect(text(screen.getByTestId('projection-goals-reserved'))).toContain('R$ 8.500,00');
  });

  it('Dado a carga, então mostra o esqueleto com texto para leitor de tela', async () => {
    const gateway = new ProjectionsGatewayStub();
    gateway.result = () => NEVER;
    await setup(gateway);

    expect(screen.getByTestId('projection-loading')).toHaveTextContent(pt.projections.loading);
  });

  it('Dado sem dados (série vazia), então o estado vazio leva a adicionar uma conta', async () => {
    const gateway = new ProjectionsGatewayStub();
    gateway.result = (query) => gateway.fast(query.horizon, []);
    await setup(gateway);

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.projections.empty.title);
    expect(screen.getByTestId('empty-state-action-add-account')).toHaveAttribute(
      'href',
      '/accounts/new',
    );
  });

  it('Dado erro, então oferece "tentar de novo" e recarrega o mesmo horizonte', async () => {
    const gateway = new ProjectionsGatewayStub();
    gateway.result = () => failWith(500, 'INTERNAL_ERROR');
    await setup(gateway, { horizon: 'D30' });

    gateway.result = null;
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(gateway.queries.at(-1)).toEqual({ horizon: 'D30', includeTrend: false });
    expect(await screen.findByTestId('projection-table')).toBeInTheDocument();
  });

  it('Dado a página, então não tem violações de acessibilidade', async () => {
    const { container } = await setup();

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
