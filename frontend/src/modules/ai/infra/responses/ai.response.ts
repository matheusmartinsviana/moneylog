import type { components } from '~/util/api/schema.gen';

type Schemas = components['schemas'];

export type AiStatusResponse = Schemas['AiStatus'];
export type AiPreviewRequestBody = Schemas['AiPreviewInput'];
export type AiPreviewResponse = Schemas['AiPreview'];
export type AiAnalysisRequestBody = Schemas['AiAnalysisInput'];
export type AiAnalysisResponse = Schemas['AiAnalysis'];
export type AiAnalysisSliceResponse = Schemas['AiAnalysisSummarySlice'];
export type InsightSliceResponse = Schemas['InsightSlice'];
export type AiSettingsResponse = Schemas['AiSettings'];
