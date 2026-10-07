import { Observable } from 'rxjs';

import type {
  AiAnalysis,
  AiAnalysisSummary,
  AiPreview,
  AiPreviewRequest,
  AiSettings,
  AiStatus,
  Insight,
} from '~/modules/ai/core/types/ai';
import type { Slice } from '~/util/api/slice';

/** Porta de IA. Falha com `ProblemError`. */
export abstract class AiGateway {
  abstract status(): Observable<AiStatus>;
  abstract createPreview(request: AiPreviewRequest): Observable<AiPreview>;
  abstract runAnalysis(
    previewId: string,
    approve: boolean,
    idempotencyKey: string,
  ): Observable<AiAnalysis>;
  abstract history(page: number, pageSize: number): Observable<Slice<AiAnalysisSummary>>;
  abstract analysis(id: string): Observable<AiAnalysis>;
  abstract insights(month: string | null): Observable<Slice<Insight>>;
  abstract settings(): Observable<AiSettings>;
  abstract saveSettings(settings: AiSettings): Observable<AiSettings>;
}
