import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { RecurrencesPage } from '~/app/features/planning/pages/recurrences.page';
import { brl, failWith } from '~/testing/accounts-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';
import {
  aRecurrence,
  aSummary,
  provideRecurrencesStub,
  RecurrencesGatewayStub,
} from '~/testing/recurrences-testing';

vi.setConfig({ testTimeout: 20_000 });

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

async function setup(gateway = new RecurrencesGatewayStub()) {
  const result = await render(RecurrencesPage, {
    providers: [provideI18nTesting('pt'), provideRouter([]), provideRecurrencesStub(gateway)],
  });
  await result.fixture.whenStable();
  return { ...result, gateway };
}

describe('RecurrencesPage', () => {
  it('Dado nenhuma recorrência, então o estado vazio mostra "Adicionar recorrência" habilitado, levando ao formulário', async () => {
    await setup();

    expect(screen.getByTestId('empty-state-title')).toHaveTextContent(pt.emptyState.planning.title);
    const action = screen.getByTestId('empty-state-action-add-recurrence');
    expect(action).toHaveAttribute('href', '/planning/recurrences/new');
    expect(action).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('recurrences-add')).toHaveAttribute(
      'href',
      '/planning/recurrences/new',
    );
  });

  it('Dado a carga, então mostra o esqueleto com texto para leitor de tela', async () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.listError = NEVER as never;
    await setup(gateway);

    expect(screen.getByTestId('recurrences-loading')).toHaveTextContent(pt.recurrences.loading);
  });

  it('Dado o resumo, então mostra custo fixo e receita recorrente do backend, rotulados como estimativa', async () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [aRecurrence()];
    gateway.summary$ = (await import('rxjs')).of(
      aSummary({ fixedCosts: brl('2345.67'), recurringIncome: brl('5000.00') }),
    );
    await setup(gateway);

    expect(text(screen.getByTestId('recurrence-fixed-costs'))).toBe('R$ 2.345,67');
    expect(text(screen.getByTestId('recurrence-recurring-income'))).toBe('R$ 5.000,00');
    expect(screen.getByTestId('recurrence-summary-estimate')).toHaveTextContent('Estimativa');
    expect(screen.getByTestId('recurrence-summary')).toHaveTextContent('Custo fixo mensal');
    expect(screen.getByTestId('recurrence-summary')).toHaveTextContent('Receita recorrente mensal');
    expect(screen.getByTestId('recurrence-summary-note')).toHaveTextContent(
      pt.recurrences.summary.note,
    );
  });

  it('Dado erro só no resumo, então a lista continua e o resumo oferece "tentar de novo"', async () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [aRecurrence()];
    gateway.summary$ = failWith(500, 'INTERNAL_ERROR');
    await setup(gateway);

    expect(screen.getByTestId('recurrence-summary-error')).toBeInTheDocument();
    expect(screen.getByTestId('recurrence-row-rec-1')).toBeInTheDocument();
    gateway.summary$ = null;
    await userEvent.click(screen.getByTestId('recurrence-summary-retry'));
    expect(await screen.findByTestId('recurrence-fixed-costs')).toBeInTheDocument();
  });

  it('Dado recorrências, então a linha mostra valor, frequência, próxima ocorrência, destino e estimativa do backend', async () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [
      aRecurrence({ nextOccurrence: '2026-10-10', monthlyEstimate: brl('119.00') }),
      aRecurrence({
        id: 'rec-2',
        description: 'Feira',
        frequency: 'CUSTOM',
        interval: 2,
        unit: 'WEEKS',
        monthlyEstimate: brl('216.67'),
        amount: brl('50.00'),
      }),
    ];
    await setup(gateway);

    expect(text(screen.getByTestId('recurrence-amount-rec-1'))).toBe('R$ 119,00');
    expect(text(screen.getByTestId('recurrence-frequency-rec-1'))).toBe('Todo mês');
    expect(text(screen.getByTestId('recurrence-next-rec-1'))).toBe('Próxima em 10 de out.');
    expect(text(screen.getByTestId('recurrence-row-rec-1'))).toContain('Em Nubank');
    expect(text(screen.getByTestId('recurrence-frequency-rec-2'))).toBe('A cada 2 semanas');
    expect(text(screen.getByTestId('recurrence-monthly-rec-2'))).toContain('R$ 216,67');
    expect(screen.getByTestId('recurrence-edit-rec-1')).toHaveAttribute(
      'href',
      '/planning/recurrences/rec-1/edit',
    );
  });

  it('Dado recorrência desativada ou com fim, então diz isso em texto', async () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [
      aRecurrence({ active: false, nextOccurrence: null }),
      aRecurrence({ id: 'rec-2', endDate: '2026-12-31' }),
    ];
    await setup(gateway);

    expect(screen.getByTestId('recurrence-inactive-rec-1')).toHaveTextContent(
      pt.recurrences.row.inactive,
    );
    expect(text(screen.getByTestId('recurrence-ends-rec-2'))).toBe('Termina em 31 de dez.');
  });

  it('Dado recorrência encerrada (ended), então mostra "Encerrada", esconde a estimativa e a ação "Encerrar", e não diz que há próxima', async () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [
      aRecurrence({
        ended: true,
        endDate: '2026-09-30',
        nextOccurrence: null,
        monthlyEstimate: brl('0.00'),
      }),
      aRecurrence({ id: 'rec-2', description: 'Seguro' }),
    ];
    await setup(gateway);

    expect(screen.getByTestId('recurrence-ended-rec-1')).toHaveTextContent(
      pt.recurrences.row.ended,
    );
    expect(screen.queryByTestId('recurrence-monthly-rec-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recurrence-next-rec-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recurrence-ended-rec-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('recurrence-monthly-rec-2')).toBeInTheDocument();
    // Reabrir é pela edição (nova data de fim), que continua disponível.
    expect(screen.getByTestId('recurrence-edit-rec-1')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('recurrence-menu-rec-1'));
    expect(screen.queryByTestId('recurrence-menu-rec-1-item-end')).not.toBeInTheDocument();
    expect(screen.getByTestId('recurrence-menu-rec-1-item-deactivate')).toBeInTheDocument();
  });

  it('Dado desativar, quando confirmo, então usa a recorrência da resposta, recarrega a estimativa e avisa', async () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [aRecurrence()];
    const { fixture } = await setup(gateway);
    gateway.calls.length = 0;

    await userEvent.click(screen.getByTestId('recurrence-menu-rec-1'));
    await userEvent.click(screen.getByTestId('recurrence-menu-rec-1-item-deactivate'));
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.calls).toEqual(['deactivate:rec-1', 'summary']);
    expect(screen.getByTestId('recurrence-inactive-rec-1')).toBeInTheDocument();
  });

  it('Dado encerrar, então pede a data e envia a escolhida', async () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [aRecurrence()];
    const { fixture } = await setup(gateway);

    await userEvent.click(screen.getByTestId('recurrence-menu-rec-1'));
    await userEvent.click(screen.getByTestId('recurrence-menu-rec-1-item-end'));
    const date = screen.getByTestId('end-date') as HTMLInputElement;
    await userEvent.clear(date);
    await userEvent.type(date, '31/12/2026');
    await userEvent.click(screen.getByTestId('end-submit'));
    await fixture.whenStable();

    expect(gateway.calls).toContain('end:rec-1:2026-12-31');
    expect(screen.queryByTestId('end-sheet-panel')).not.toBeInTheDocument();
  });

  it('Dado RECURRENCE_INVALID ao encerrar, então o motivo traduzido aparece na folha e ela continua aberta', async () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [aRecurrence()];
    const { fixture } = await setup(gateway);
    gateway.next = failWith(422, 'RECURRENCE_INVALID');

    await userEvent.click(screen.getByTestId('recurrence-menu-rec-1'));
    await userEvent.click(screen.getByTestId('recurrence-menu-rec-1-item-end'));
    await userEvent.click(screen.getByTestId('end-submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(screen.getByTestId('end-error')).toHaveTextContent(
      pt.errors.codes['RECURRENCE_INVALID']!,
    );
  });

  it('Dado erro de rede, então mostra o erro com "tentar de novo" e recarrega', async () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.listError = failWith(0, 'NETWORK');
    await setup(gateway);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();

    gateway.listError = null;
    gateway.recurrences = [aRecurrence()];
    await userEvent.click(screen.getByTestId('empty-state-action-retry'));

    expect(await screen.findByTestId('recurrence-row-rec-1')).toBeInTheDocument();
  });

  it('Dado a navegação, então as duas telas de planejamento são links e a atual é marcada', async () => {
    await setup();

    expect(screen.getByTestId('planning-tab-recurrences')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('planning-tab-pending')).toHaveAttribute(
      'href',
      '/planning/occurrences',
    );
  });

  it('Dado a lista, então o axe não aponta violações', async () => {
    const gateway = new RecurrencesGatewayStub();
    gateway.recurrences = [aRecurrence(), aRecurrence({ id: 'rec-2', active: false })];
    const { container } = await setup(gateway);

    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
