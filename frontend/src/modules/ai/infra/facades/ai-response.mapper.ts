import type {
  AiAnalysis,
  AiAnalysisSummary,
  AiPreview,
  AiStatus,
  Insight,
} from '~/modules/ai/core/types/ai';
import type {
  AiAnalysisResponse,
  AiAnalysisSliceResponse,
  AiPreviewResponse,
  AiStatusResponse,
  InsightSliceResponse,
} from '~/modules/ai/infra/responses/ai.response';
import type { Slice } from '~/util/api/slice';

export function toStatus(r: AiStatusResponse): AiStatus {
  return { ...r };
}

export function toPreview(r: AiPreviewResponse): AiPreview {
  return {
    previewId: r.previewId,
    purpose: r.purpose,
    period: r.period ?? null,
    language: r.language,
    redactedPayload: r.redactedPayload,
    counts: r.counts,
    estimatedTokens: r.estimatedTokens,
    expiresAt: r.expiresAt,
    redactions: r.redactions,
  };
}

export function toAnalysis(r: AiAnalysisResponse): AiAnalysis {
  return {
    id: r.id,
    purpose: r.purpose,
    period: r.period ?? null,
    provider: r.provider,
    model: r.model,
    status: r.status,
    tokens: { input: r.tokens.input, output: r.tokens.output },
    result: r.result
      ? { text: r.result.text, caveat: r.result.caveat ?? null, factRefs: r.result.factRefs }
      : null,
    fallback: r.fallback,
    failureReason: r.failureReason ?? null,
    redactedPayload: r.redactedPayload ?? null,
    payloadPurgedAt: r.payloadPurgedAt ?? null,
    createdAt: r.createdAt,
  };
}

export function toHistory(r: AiAnalysisSliceResponse): Slice<AiAnalysisSummary> {
  return {
    hasNext: r.hasNext,
    items: r.items.map((i) => ({
      id: i.id,
      purpose: i.purpose,
      period: i.period ?? null,
      provider: i.provider,
      model: i.model,
      status: i.status,
      tokens: { input: i.tokens.input, output: i.tokens.output },
      fallback: i.fallback,
      payloadAvailable: i.payloadAvailable,
      payloadPurgedAt: i.payloadPurgedAt ?? null,
      createdAt: i.createdAt,
    })),
  };
}

export function toInsights(r: InsightSliceResponse): Slice<Insight> {
  return {
    hasNext: r.hasNext,
    items: r.items.map((i) => ({
      type: i.type,
      key: i.key,
      params: i.params,
      factRefs: i.factRefs,
    })),
  };
}
