import { HttpErrorResponse } from '@angular/common/http';

/**
 * Erro de campo de um `VALIDATION_FAILED` (`Problem.errors[]` do contrato). O front traduz pelo
 * `code`; `message` vem do backend só para diagnóstico e não é exibida (FE 05).
 */
export interface FieldProblem {
  /** Caminho do campo na requisição (`amount`, `categoryId`...). */
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

/** Falha de uma chamada à API em forma tipada: o core nunca vê `HttpErrorResponse`. */
export interface Problem {
  /** Status HTTP; `0` quando não houve resposta (rede, offline, CORS). */
  readonly status: number;
  /** `code` estável do contrato (`ACCOUNT_ARCHIVED`...); `NETWORK` para status 0. */
  readonly code: string;
  readonly fieldErrors: readonly FieldProblem[];
  /** Mesmo valor do header `X-Trace-Id`, para suporte (nunca para decisão de tela). */
  readonly traceId: string | null;
  /** `Retry-After` (segundos) quando o backend limita as tentativas (429). */
  readonly retryAfterSeconds: number | null;
  /** `detail` do corpo, só para extrair a linha/causa de `IMPORT_APPLY_FAILED`; nunca é exibido. */
  readonly detail?: string | null;
}

/** Erro lançável com o `Problem` dentro, para as facades de requisições repassarem ao core. */
export class ProblemError extends Error {
  constructor(readonly problem: Problem) {
    super(`API ${problem.status} ${problem.code}`);
    this.name = 'ProblemError';
  }
}

export const NETWORK_CODE = 'NETWORK';

/** `code` assumido quando a resposta não traz um `Problem` (proxy, gateway, HTML de erro). */
const FALLBACK_CODE: Readonly<Record<number, string>> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'TOO_MANY_ATTEMPTS',
  500: 'INTERNAL_ERROR',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFieldErrors(value: unknown): readonly FieldProblem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    field: typeof item['field'] === 'string' ? item['field'] : '',
    code: typeof item['code'] === 'string' ? item['code'] : 'INVALID',
    message: typeof item['message'] === 'string' ? item['message'] : '',
  }));
}

function toRetryAfter(header: string | null): number | null {
  if (header === null || !/^\d+$/.test(header.trim())) return null;
  return Number.parseInt(header.trim(), 10);
}

/**
 * `HttpErrorResponse` → `Problem` (RFC 9457 do contrato). Erro de rede (`status 0`) vira
 * `NETWORK`; corpo sem `code` cai num `code` padrão por status. Nunca lança.
 */
export function toProblem(error: unknown): Problem {
  if (!(error instanceof HttpErrorResponse)) {
    return {
      status: 0,
      code: NETWORK_CODE,
      fieldErrors: [],
      traceId: null,
      retryAfterSeconds: null,
    };
  }
  if (error.status === 0) {
    return {
      status: 0,
      code: NETWORK_CODE,
      fieldErrors: [],
      traceId: null,
      retryAfterSeconds: null,
    };
  }
  const body: unknown = error.error;
  const code =
    isRecord(body) && typeof body['code'] === 'string' && body['code'] !== ''
      ? body['code']
      : (FALLBACK_CODE[error.status] ?? `HTTP_${error.status}`);
  const traceId =
    isRecord(body) && typeof body['traceId'] === 'string'
      ? body['traceId']
      : (error.headers?.get('X-Trace-Id') ?? null);
  return {
    status: error.status,
    code,
    fieldErrors: isRecord(body) ? toFieldErrors(body['errors']) : [],
    traceId,
    retryAfterSeconds: toRetryAfter(error.headers?.get('Retry-After') ?? null),
    detail: isRecord(body) && typeof body['detail'] === 'string' ? body['detail'] : null,
  };
}

/** Extrai o `Problem` de um erro lançado pela infra; qualquer outra coisa vira falha de rede. */
export function problemOf(error: unknown): Problem {
  return error instanceof ProblemError ? error.problem : toProblem(error);
}
