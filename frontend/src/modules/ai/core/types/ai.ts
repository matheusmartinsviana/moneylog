/** Tipos do domínio de IA (Etapa 8). O front exibe o que a API devolve; nada é calculado aqui. */
export type AiPurpose =
  | 'CATEGORIZE_IMPORT'
  | 'CATEGORIZE_TRANSACTIONS'
  | 'ANALYZE_STATEMENT'
  | 'MONTHLY_SUMMARY'
  | 'INSIGHTS'
  | 'FORECAST'
  | 'DAILY_MESSAGE';

/** Finalidades que já geram prévia no backend. */
export type AiRunnablePurpose = 'MONTHLY_SUMMARY' | 'INSIGHTS';

export type AiAnalysisStatus =
  'COMPLETED' | 'FAILED' | 'DENIED' | 'REJECTED_UNGROUNDED' | 'BUDGET_EXCEEDED';

export interface AiStatus {
  readonly enabled: boolean;
  readonly provider: string;
  readonly model: string;
  readonly dailyCallsRemaining: number;
  readonly monthlyTokensRemaining: number;
  readonly circuit: 'CLOSED' | 'OPEN';
}

export interface AiPreviewRequest {
  readonly purpose: AiRunnablePurpose;
  /** Competência `AAAA-MM`; `null` = mês corrente do backend. */
  readonly month: string | null;
  readonly language: 'pt' | 'en' | 'es';
}

export interface AiPreview {
  readonly previewId: string;
  readonly purpose: AiPurpose;
  readonly period: string | null;
  readonly language: string;
  /** O JSON exato que iria ao provedor. */
  readonly redactedPayload: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly estimatedTokens: number;
  readonly expiresAt: string;
  readonly redactions: readonly string[];
}

export interface AiTokens {
  readonly input: number;
  readonly output: number;
}

export interface AiResult {
  readonly text: string;
  readonly caveat: string | null;
  readonly factRefs: readonly string[];
}

export interface AiAnalysis {
  readonly id: string;
  readonly purpose: AiPurpose;
  readonly period: string | null;
  readonly provider: string;
  readonly model: string;
  readonly status: AiAnalysisStatus;
  readonly tokens: AiTokens;
  readonly result: AiResult | null;
  readonly fallback: boolean;
  readonly failureReason: string | null;
  readonly redactedPayload: string | null;
  readonly payloadPurgedAt: string | null;
  readonly createdAt: string;
}

export interface AiAnalysisSummary {
  readonly id: string;
  readonly purpose: AiPurpose;
  readonly period: string | null;
  readonly provider: string;
  readonly model: string;
  readonly status: AiAnalysisStatus;
  readonly tokens: AiTokens;
  readonly fallback: boolean;
  readonly payloadAvailable: boolean;
  readonly payloadPurgedAt: string | null;
  readonly createdAt: string;
}

/** Insight determinístico: o backend manda a `key` de i18n e os `params`; a frase é montada na tela. */
export interface Insight {
  readonly type: 'CATEGORY_DELTA' | 'CARD_COMMITTED';
  readonly key: string;
  readonly params: Readonly<Record<string, string>>;
  readonly factRefs: readonly string[];
}

export interface AiSettings {
  readonly dailyMessageEnabled: boolean;
}
