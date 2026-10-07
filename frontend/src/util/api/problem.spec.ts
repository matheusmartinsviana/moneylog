import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';

import { NETWORK_CODE, ProblemError, toProblem } from '~/util/api/problem';

function failure(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new HttpErrorResponse({
    status,
    error: body,
    headers: new HttpHeaders(headers),
    url: '/v1/x',
  });
}

function problemBody(status: number, code: string, extra: object = {}) {
  return {
    type: `urn:moneylog:problem:${code}`,
    title: 'x',
    status,
    code,
    traceId: 't-1',
    ...extra,
  };
}

describe('toProblem', () => {
  it.each([
    [401, 'UNAUTHENTICATED'],
    [404, 'ACCOUNT_NOT_FOUND'],
    [409, 'VERSION_CONFLICT'],
    [422, 'ACCOUNT_WITH_BALANCE_CANNOT_BE_ARCHIVED'],
    [500, 'INTERNAL_ERROR'],
  ])('Dado um %i com Problem, então devolve status e code do corpo', (status, code) => {
    const problem = toProblem(failure(status, problemBody(status, code)));

    expect(problem).toMatchObject({ status, code, fieldErrors: [], traceId: 't-1' });
  });

  it('Dado um 400 com errors[], então devolve os erros de campo tipados', () => {
    const problem = toProblem(
      failure(
        400,
        problemBody(400, 'VALIDATION_FAILED', {
          errors: [{ field: 'amount', code: 'PATTERN', message: 'inválido' }],
        }),
      ),
    );

    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(problem.fieldErrors).toEqual([
      { field: 'amount', code: 'PATTERN', message: 'inválido' },
    ]);
  });

  it('Dado um 429 com Retry-After, então devolve a espera em segundos', () => {
    const problem = toProblem(
      failure(429, problemBody(429, 'TOO_MANY_ATTEMPTS'), { 'Retry-After': '540' }),
    );

    expect(problem).toMatchObject({
      status: 429,
      code: 'TOO_MANY_ATTEMPTS',
      retryAfterSeconds: 540,
    });
  });

  it('Dado um 429 sem Retry-After legível, então a espera é nula', () => {
    expect(toProblem(failure(429, null, { 'Retry-After': 'amanhã' })).retryAfterSeconds).toBeNull();
    expect(toProblem(failure(429, null)).retryAfterSeconds).toBeNull();
  });

  it('Dado um erro de rede (status 0), então devolve NETWORK', () => {
    const problem = toProblem(failure(0, new ProgressEvent('error')));

    expect(problem).toEqual({
      status: 0,
      code: NETWORK_CODE,
      fieldErrors: [],
      traceId: null,
      retryAfterSeconds: null,
    });
  });

  it('Dado um erro que não é HTTP, então também vira NETWORK', () => {
    expect(toProblem(new Error('boom')).code).toBe(NETWORK_CODE);
  });

  it.each([
    [400, 'VALIDATION_FAILED'],
    [401, 'UNAUTHENTICATED'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [422, 'UNPROCESSABLE'],
    [429, 'TOO_MANY_ATTEMPTS'],
    [500, 'INTERNAL_ERROR'],
    [502, 'HTTP_502'],
  ])(
    'Dado um %i sem Problem no corpo (HTML do proxy), então usa o code padrão %s',
    (status, code) => {
      expect(toProblem(failure(status, '<html>bad gateway</html>')).code).toBe(code);
    },
  );

  it('Dado o header X-Trace-Id e corpo sem traceId, então usa o header', () => {
    expect(toProblem(failure(500, null, { 'X-Trace-Id': 'abc' })).traceId).toBe('abc');
  });

  it('Dado errors[] malformado, então ignora o que não é objeto e preenche o que falta', () => {
    const problem = toProblem(
      failure(400, { code: 'VALIDATION_FAILED', errors: ['x', { field: 1 }] }),
    );

    expect(problem.fieldErrors).toEqual([{ field: '', code: 'INVALID', message: '' }]);
  });
});

describe('ProblemError', () => {
  it('carrega o Problem e uma mensagem sem dados sensíveis', () => {
    const problem = toProblem(failure(422, problemBody(422, 'ACCOUNT_ARCHIVED')));
    const error = new ProblemError(problem);

    expect(error.problem).toBe(problem);
    expect(error.message).toBe('API 422 ACCOUNT_ARCHIVED');
  });
});
