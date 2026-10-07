import { provideRouter } from '@angular/router';
import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';

import { pt } from '~/app/common/i18n/translations/pt';
import { AiPage } from '~/app/features/ai/pages/ai.page';
import {
  AiGatewayStub,
  aiProblem,
  anAiAnalysis,
  anAiPreview,
  anAiStatus,
  provideAiStub,
} from '~/testing/ai-testing';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

async function setup(gateway = new AiGatewayStub()) {
  const view = await render(AiPage, {
    providers: [provideI18nTesting('pt'), provideRouter([]), provideAiStub(gateway)],
  });
  return { ...view, gateway };
}

const enabled = () => {
  const gateway = new AiGatewayStub();
  gateway.statusResult = () =>
    of(
      anAiStatus({
        enabled: true,
        provider: 'anthropic',
        model: 'claude-x',
        dailyCallsRemaining: 7,
        monthlyTokensRemaining: 900,
      }),
    );
  return gateway;
};

describe('AiPage', () => {
  it('Dado a IA desligada, então diz que não está configurada, não pede chave e desabilita os pedidos com a razão', async () => {
    const { container } = await setup();

    expect(await screen.findByTestId('ai-status-off')).toHaveTextContent(
      pt.workspacePages.ai.notConfigured,
    );
    expect(screen.getByTestId('ai-how')).toHaveTextContent('AI_API_KEY');
    expect(container.querySelector('input[type="text"], input[type="password"]')).toBeNull();
    expect(screen.getByTestId('ai-action-summary')).toBeDisabled();
    expect(screen.getByTestId('ai-actions-disabled')).toHaveTextContent(pt.ai.actions.disabled);
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('Dado a IA ligada, então mostra provedor, modelo e o que resta, sem chave', async () => {
    await setup(enabled());

    expect(await screen.findByTestId('ai-status-on')).toBeInTheDocument();
    expect(screen.getByTestId('ai-status-provider')).toHaveTextContent('anthropic');
    expect(screen.getByTestId('ai-status-provider')).toHaveTextContent('claude-x');
    expect(screen.getByTestId('ai-status-remaining')).toHaveTextContent('7');
    expect(screen.getByTestId('ai-action-summary')).toBeEnabled();
  });

  it('Dado falha ao consultar o estado, então avisa e oferece tentar de novo, e o app segue sem IA', async () => {
    const gateway = new AiGatewayStub();
    gateway.statusResult = () => aiProblem('INTERNAL_ERROR', 500);
    await setup(gateway);

    expect(await screen.findByTestId('ai-status-error')).toBeInTheDocument();
    expect(screen.getByTestId('ai-status-retry')).toBeInTheDocument();
    expect(screen.getByTestId('ai-action-summary')).toBeDisabled();
  });

  it('Dado o pedido de resumo, então mostra o conteúdo exato antes do envio e só envia ao aprovar', async () => {
    const gateway = enabled();
    gateway.previewResult = () => of(anAiPreview({ redactions: ['CPF', 'PHONE'] }));
    await setup(gateway);
    await waitFor(() => expect(screen.getByTestId('ai-action-summary')).toBeEnabled());

    await userEvent.click(screen.getByTestId('ai-action-summary'));

    expect(await screen.findByTestId('ai-ask-consent')).toBeInTheDocument();
    expect(gateway.previews[0]).toMatchObject({ purpose: 'MONTHLY_SUMMARY', language: 'pt' });
    expect(screen.getByTestId('ai-ask-redactions')).toHaveTextContent('CPF');
    expect(screen.getByTestId('ai-ask-redactions')).toHaveTextContent('Telefones');
    await userEvent.click(screen.getByTestId('ai-ask-payload-toggle'));
    expect(screen.getByTestId('ai-ask-payload-text')).toHaveTextContent('"expenses":"1200.00"');
    expect(gateway.runs).toEqual([]);

    await userEvent.click(screen.getByTestId('ai-ask-send'));

    const result = await screen.findByTestId('ai-ask-result');
    expect(within(result).getByTestId('ai-ask-badge')).toHaveTextContent(pt.ai.result.badge);
    expect(result).toHaveTextContent('Seus gastos ficaram estáveis.');
    expect(screen.getByTestId('ai-ask-warning')).toBeInTheDocument();
    expect(gateway.runs).toHaveLength(1);
  });

  it('Dado "Cancelar" no consentimento, então nada é enviado', async () => {
    const gateway = enabled();
    await setup(gateway);
    await waitFor(() => expect(screen.getByTestId('ai-action-insights')).toBeEnabled());
    await userEvent.click(screen.getByTestId('ai-action-insights'));
    await screen.findByTestId('ai-ask-consent');

    await userEvent.click(screen.getByTestId('ai-ask-cancel'));

    expect(screen.queryByTestId('ai-ask-consent')).not.toBeInTheDocument();
    expect(gateway.runs).toEqual([]);
  });

  it('Dado análise descartada (fallback), então explica sem erro bloqueante e leva aos insights calculados', async () => {
    const gateway = enabled();
    gateway.runResult = () =>
      of(anAiAnalysis({ status: 'REJECTED_UNGROUNDED', fallback: true, result: null }));
    await setup(gateway);
    await waitFor(() => expect(screen.getByTestId('ai-action-summary')).toBeEnabled());
    await userEvent.click(screen.getByTestId('ai-action-summary'));
    await userEvent.click(await screen.findByTestId('ai-ask-send'));

    const fallback = await screen.findByTestId('ai-ask-fallback');
    expect(fallback).toHaveTextContent(pt.ai.result.ungrounded);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('ai-ask-fallback-insights')).toHaveAttribute('href', '/insights');
  });

  it('Dado prévia expirada ao enviar, então pede para gerar outra', async () => {
    const gateway = enabled();
    gateway.runResult = () => aiProblem('AI_PREVIEW_EXPIRED');
    await setup(gateway);
    await waitFor(() => expect(screen.getByTestId('ai-action-summary')).toBeEnabled());
    await userEvent.click(screen.getByTestId('ai-action-summary'));
    await userEvent.click(await screen.findByTestId('ai-ask-send'));

    expect(await screen.findByTestId('ai-ask-error')).toHaveTextContent(
      pt.errors.codes['AI_PREVIEW_EXPIRED']!,
    );
    await userEvent.click(screen.getByTestId('ai-ask-redo'));
    expect(await screen.findByTestId('ai-ask-consent')).toBeInTheDocument();
    expect(gateway.previews).toHaveLength(2);
  });

  it('Dado o histórico vazio, então mostra o estado vazio', async () => {
    await setup();
    expect(await screen.findByText(pt.ai.history.empty)).toBeInTheDocument();
  });

  it('Dado o histórico, então lista a análise e mostra o conteúdo enviado só ao pedir', async () => {
    const gateway = new AiGatewayStub();
    gateway.historyResult = () =>
      of({
        hasNext: false,
        items: [
          {
            id: 'a-1',
            purpose: 'MONTHLY_SUMMARY' as const,
            period: '2026-10',
            provider: 'fake',
            model: 'fake-1',
            status: 'COMPLETED' as const,
            tokens: { input: 10, output: 5 },
            fallback: false,
            payloadAvailable: true,
            payloadPurgedAt: null,
            createdAt: '2026-10-07T12:00:00Z',
          },
          {
            id: 'a-2',
            purpose: 'INSIGHTS' as const,
            period: '2026-09',
            provider: 'fake',
            model: 'fake-1',
            status: 'FAILED' as const,
            tokens: { input: 0, output: 0 },
            fallback: true,
            payloadAvailable: false,
            payloadPurgedAt: '2026-12-01T00:00:00Z',
            createdAt: '2026-09-07T12:00:00Z',
          },
        ],
      });
    await setup(gateway);

    expect(await screen.findByTestId('ai-history-row-a-1')).toHaveTextContent('Concluída');
    expect(screen.getByTestId('ai-history-purged')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('ai-history-payload-toggle-a-1'));
    expect(await screen.findByTestId('ai-history-payload')).toHaveTextContent('enviado');
  });

  it('Dado a mensagem diária, então a preferência fica desligada por padrão e salva ao ligar', async () => {
    const gateway = new AiGatewayStub();
    await setup(gateway);

    const toggle = await screen.findByTestId('ai-daily-message');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);

    await waitFor(() => expect(gateway.saved).toEqual([{ dailyMessageEnabled: true }]));
    expect(screen.getByTestId('ai-daily-message')).toHaveAttribute('aria-checked', 'true');
  });
});
