import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AiConsentFacade } from '~/modules/ai/core/facades/ai-consent.facade';
import { aiProblem, AiGatewayStub, anAiAnalysis, provideAiStub } from '~/testing/ai-testing';

function setup(gateway = new AiGatewayStub()) {
  TestBed.configureTestingModule({ providers: [provideAiStub(gateway), AiConsentFacade] });
  return { gateway, facade: TestBed.inject(AiConsentFacade) };
}

const request = { purpose: 'MONTHLY_SUMMARY', month: '2026-10', language: 'pt' } as const;

describe('AiConsentFacade', () => {
  it('Dado um pedido, então a prévia vem do backend e nada é enviado antes da aprovação', () => {
    const { facade, gateway } = setup();

    facade.start(request);

    expect(facade.state().step).toBe('consent');
    expect(gateway.runs).toEqual([]);
  });

  it('Dado a aprovação, então envia a prévia vista com uma Idempotency-Key e mostra o resultado do backend', () => {
    const { facade, gateway } = setup();
    facade.start(request);

    facade.approve();

    expect(gateway.runs).toHaveLength(1);
    expect(gateway.runs[0]).toMatchObject({ previewId: 'p-1', approve: true });
    expect(gateway.runs[0]!.key).not.toBe('');
    expect(facade.state()).toMatchObject({ step: 'done', analysis: { id: 'a-1' } });
  });

  it('Dado falha de rede ao enviar, então volta ao consentimento e o tentar de novo reusa a mesma chave', () => {
    const { facade, gateway } = setup();
    gateway.runResult = () => aiProblem('NETWORK', 0);
    facade.start(request);
    facade.approve();
    expect(facade.state()).toMatchObject({ step: 'consent', problem: { code: 'NETWORK' } });

    gateway.runResult = () => aiProblem('NETWORK', 0);
    facade.approve();

    expect(gateway.runs[0]!.key).toBe(gateway.runs[1]!.key);
  });

  it('Dado prévia expirada, então o estado é erro e refazer gera outra prévia com chave nova', () => {
    const { facade, gateway } = setup();
    gateway.runResult = () => aiProblem('AI_PREVIEW_EXPIRED');
    facade.start(request);
    facade.approve();
    expect(facade.state()).toMatchObject({
      step: 'error',
      problem: { code: 'AI_PREVIEW_EXPIRED' },
    });

    gateway.runResult = () => aiProblem('AI_PREVIEW_EXPIRED');
    facade.redo();
    facade.approve();

    expect(gateway.previews).toHaveLength(2);
    expect(gateway.runs[0]!.key).not.toBe(gateway.runs[1]!.key);
  });

  it('Dado fallback, então a análise vem sem texto e sem erro bloqueante', () => {
    const { facade, gateway } = setup();
    gateway.runResult = () =>
      of(anAiAnalysis({ status: 'REJECTED_UNGROUNDED', fallback: true, result: null }));
    facade.start(request);

    facade.approve();

    expect(facade.state()).toMatchObject({
      step: 'done',
      analysis: { fallback: true, status: 'REJECTED_UNGROUNDED' },
    });
  });

  it('Dado falha de prévia, então o estado é erro tipado (ex.: IA desligada)', () => {
    const { facade, gateway } = setup();
    gateway.previewResult = () => aiProblem('AI_DISABLED');

    facade.start(request);

    expect(facade.state()).toMatchObject({ step: 'error', problem: { code: 'AI_DISABLED' } });
  });
});
