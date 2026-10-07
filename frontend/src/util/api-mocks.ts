import { InjectionToken } from '@angular/core';

/**
 * Flag de ambiente lida pelas facades de requisições (`modules/<ctx>/infra`): `true` responde com
 * `mock-data` e não faz HTTP; `false` chama a API (`/v1`).
 *
 * O valor vem de um lugar só (`src/app/config/environment.ts`) e é fornecido no bootstrap. O padrão
 * é `true` porque, na Etapa 1, nenhuma chamada a `/v1` pode acontecer (plano, T20 CA6).
 */
export const API_MOCKS = new InjectionToken<boolean>('API_MOCKS', {
  providedIn: 'root',
  factory: () => true,
});

/** Onde um teste E2E (ou o desenvolvedor, no console) deixa as respostas brutas do mock, por chave. */
const MOCK_RESPONSES_KEY = '__MONEYLOG_MOCK_RESPONSES__';

/**
 * Resposta do mock para `key` (o caminho da API, com a query quando ela muda a resposta: `/v1/summaries/2026-10`,
 * `/v1/reports/income-expenses?period=D30`). **Só as facades com `API_MOCKS` ligado chamam isto**; em produção
 * real o ramo não existe. O E2E põe o JSON bruto (no formato do contrato) em
 * `window.__MONEYLOG_MOCK_RESPONSES__` antes de o app subir (`page.addInitScript`), então nenhum dado de
 * demonstração viaja no bundle: sem a chave, vale o `fallback` (o estado vazio de sempre).
 */
export function mockResponse<T>(key: string, fallback: T): T {
  const store = (globalThis as Record<string, unknown>)[MOCK_RESPONSES_KEY];
  if (typeof store !== 'object' || store === null) return fallback;
  const value = (store as Record<string, unknown>)[key];
  return value === undefined ? fallback : (value as T);
}
