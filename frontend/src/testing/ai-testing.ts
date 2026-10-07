import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';

import { AiGateway } from '~/modules/ai/core/interfaces/ai.gateway';
import type {
  AiAnalysis,
  AiAnalysisSummary,
  AiPreview,
  AiPreviewRequest,
  AiSettings,
  AiStatus,
  Insight,
} from '~/modules/ai/core/types/ai';
import { ProblemError } from '~/util/api/problem';
import type { Slice } from '~/util/api/slice';

export function anAiStatus(overrides: Partial<AiStatus> = {}): AiStatus {
  return {
    enabled: false,
    provider: 'none',
    model: '',
    dailyCallsRemaining: 0,
    monthlyTokensRemaining: 0,
    circuit: 'CLOSED',
    ...overrides,
  };
}

export function anAiPreview(overrides: Partial<AiPreview> = {}): AiPreview {
  return {
    previewId: 'p-1',
    purpose: 'MONTHLY_SUMMARY',
    period: '2026-10',
    language: 'pt',
    redactedPayload: '{"facts":{"expenses":"1200.00"}}',
    counts: { facts: 4 },
    estimatedTokens: 321,
    expiresAt: '2026-10-07T12:15:00Z',
    redactions: ['CPF'],
    ...overrides,
  };
}

export function anAiAnalysis(overrides: Partial<AiAnalysis> = {}): AiAnalysis {
  return {
    id: 'a-1',
    purpose: 'MONTHLY_SUMMARY',
    period: '2026-10',
    provider: 'fake',
    model: 'fake-1',
    status: 'COMPLETED',
    tokens: { input: 100, output: 40 },
    result: { text: 'Seus gastos ficaram estáveis.', caveat: 'Mês em andamento.', factRefs: [] },
    fallback: false,
    failureReason: null,
    redactedPayload: null,
    payloadPurgedAt: null,
    createdAt: '2026-10-07T12:00:00Z',
    ...overrides,
  };
}

export function anInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    type: 'CATEGORY_DELTA',
    key: 'insight.category.up',
    params: {
      categoryId: 'cat-1',
      categoryName: 'Alimentação',
      current: '600.00',
      previous: '450.00',
      deltaAmount: '150.00',
      deltaPercent: '33.3',
    },
    factRefs: [],
    ...overrides,
  };
}

/** Porta de IA em memória; cada operação é um campo que o teste troca. */
export class AiGatewayStub extends AiGateway {
  statusResult: () => Observable<AiStatus> = () => of(anAiStatus());
  previewResult: (request: AiPreviewRequest) => Observable<AiPreview> = () => of(anAiPreview());
  runResult: (key: string) => Observable<AiAnalysis> = () => of(anAiAnalysis());
  historyResult: () => Observable<Slice<AiAnalysisSummary>> = () =>
    of({ items: [], hasNext: false });
  insightsResult: () => Observable<Slice<Insight>> = () => of({ items: [], hasNext: false });
  settingsResult: AiSettings = { dailyMessageEnabled: false };
  saveFails = false;

  readonly previews: AiPreviewRequest[] = [];
  readonly runs: { previewId: string; approve: boolean; key: string }[] = [];
  readonly saved: AiSettings[] = [];

  status() {
    return this.statusResult();
  }
  createPreview(request: AiPreviewRequest) {
    this.previews.push(request);
    return this.previewResult(request);
  }
  runAnalysis(previewId: string, approve: boolean, key: string) {
    this.runs.push({ previewId, approve, key });
    return this.runResult(key);
  }
  history() {
    return this.historyResult();
  }
  analysis() {
    return of(anAiAnalysis({ redactedPayload: '{"enviado":true}' }));
  }
  insights() {
    return this.insightsResult();
  }
  settings() {
    return of(this.settingsResult);
  }
  saveSettings(settings: AiSettings) {
    this.saved.push(settings);
    if (this.saveFails)
      return throwError(
        () =>
          new ProblemError({
            status: 500,
            code: 'INTERNAL_ERROR',
            fieldErrors: [],
            traceId: null,
            retryAfterSeconds: null,
          }),
      );
    this.settingsResult = settings;
    return of(settings);
  }
}

export function provideAiStub(gateway: AiGatewayStub = new AiGatewayStub()): Provider[] {
  return [{ provide: AiGateway, useValue: gateway }];
}

export function aiProblem(code: string, status = 422): Observable<never> {
  return throwError(
    () =>
      new ProblemError({ status, code, fieldErrors: [], traceId: null, retryAfterSeconds: null }),
  );
}
