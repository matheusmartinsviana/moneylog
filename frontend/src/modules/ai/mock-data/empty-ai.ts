import type { AiSettings, AiStatus } from '~/modules/ai/core/types/ai';

/** Ambiente mock: IA desligada, sem requisição. */
export const OFF_STATUS: AiStatus = {
  enabled: false,
  provider: 'none',
  model: '',
  dailyCallsRemaining: 0,
  monthlyTokensRemaining: 0,
  circuit: 'CLOSED',
};

export const DEFAULT_AI_SETTINGS: AiSettings = { dailyMessageEnabled: false };
