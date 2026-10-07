import { problemMessage } from '~/app/common/i18n/problem-message';
import { en } from '~/app/common/i18n/translations/en';
import { es } from '~/app/common/i18n/translations/es';
import { pt } from '~/app/common/i18n/translations/pt';
import type { Problem } from '~/util/api/problem';

const problem = (status: number, code: string): Problem => ({
  status,
  code,
  fieldErrors: [],
  traceId: null,
  retryAfterSeconds: null,
});

/**
 * Códigos concretos da tabela `Problem.code` de `contracts/openapi.yaml` (curingas `*_TOO_LONG` e
 * `*_REQUIRED` ficam de fora: os concretos que o backend lança estão em `EMITTED`). Ao mudar a tabela
 * do contrato, atualize esta lista: o teste garante que nenhum code fica sem tradução.
 */
const CONTRACT_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'REFRESH_INVALID',
  'ORIGIN_NOT_ALLOWED',
  'ACCOUNT_NOT_FOUND',
  'CATEGORY_NOT_FOUND',
  'TRANSACTION_NOT_FOUND',
  'VERSION_CONFLICT',
  'CATEGORY_NAME_TAKEN',
  'IDEMPOTENCY_KEY_REUSED',
  'ACCOUNT_WITH_BALANCE_CANNOT_BE_ARCHIVED',
  'ACCOUNT_WITH_FUTURE_BALANCE_CANNOT_BE_ARCHIVED',
  'ACCOUNT_ARCHIVED',
  'ACCOUNT_ALREADY_ARCHIVED',
  'ACCOUNT_NOT_ARCHIVED',
  'ACCOUNT_OPENING_LOCKED',
  'CATEGORY_ARCHIVED',
  'CATEGORY_ALREADY_ARCHIVED',
  'CATEGORY_NOT_ARCHIVED',
  'CATEGORY_KIND_MISMATCH',
  'TRANSFER_SAME_ACCOUNT',
  'TRANSFER_ACROSS_LIQUIDITY',
  'INVESTMENT_ACCOUNTS_MISMATCH',
  'TRANSACTION_ACCOUNT_NOT_CASH',
  'TRANSACTION_PAYMENT_METHOD_REQUIRED',
  'TRANSACTION_AMOUNT_NOT_POSITIVE',
  'ADJUSTMENT_REASON_REQUIRED',
  'ADJUSTMENT_YIELD_REQUIRES_INVESTMENT_ACCOUNT',
  'REFUND_EXCEEDS_ORIGINAL',
  'REFUND_INVALID_ORIGINAL',
  'REFUND_CATEGORY_LOCKED',
  'TRANSACTION_ALREADY_VOIDED',
  'TRANSACTION_VOID_REASON_REQUIRED',
  'TRANSACTION_HAS_ACTIVE_REFUNDS',
  'TRANSACTION_NOT_EDITABLE',
  'TRANSACTION_TYPE_NOT_AVAILABLE',
  'AMOUNT_ABOVE_LIMIT',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'NOT_ACCEPTABLE',
  'UNSUPPORTED_MEDIA_TYPE',
  'TOO_MANY_ATTEMPTS',
  'INTERNAL_ERROR',
];

describe('problemMessage', () => {
  const dictionaries = { pt, en, es };

  it('Dado a tabela de códigos do contrato, então há ao menos os códigos esperados', () => {
    expect(CONTRACT_CODES).toEqual(
      expect.arrayContaining(['ORIGIN_NOT_ALLOWED', 'UNAUTHENTICATED', 'TRANSFER_SAME_ACCOUNT']),
    );
  });

  it.each(Object.entries(dictionaries))(
    'Dado %s, então todo code do contrato tem tradução própria',
    (_, dict) => {
      const missing = CONTRACT_CODES.filter((code) => !dict.errors.codes[code]);
      expect(missing).toEqual([]);
    },
  );

  it.each(Object.entries(dictionaries))(
    'Dado %s, então os codes que o backend emite e o front pode exibir têm tradução',
    (_, dict) => {
      const emitted = [
        'INVALID_RANGE',
        'CURRENCY_MISMATCH',
        'ACCOUNT_NAME_TOO_LONG',
        'ACCOUNT_INSTITUTION_TOO_LONG',
        'CATEGORY_NAME_TOO_LONG',
        'TRANSACTION_TEXT_TOO_LONG',
        'TRANSACTION_INVALID_ORIGIN',
      ];
      expect(emitted.filter((code) => !dict.errors.codes[code])).toEqual([]);
    },
  );

  it('Dado um 422 com code desconhecido, então a mensagem é honesta e não "nada foi alterado"', () => {
    const message = problemMessage(problem(422, 'ALGUMA_REGRA_NOVA'), pt.errors);
    expect(message).toBe(pt.errors.unprocessable);
    expect(message).not.toBe(pt.errors.unavailable);
  });

  it('Dado um code desconhecido em outros status, então usa a mensagem do status', () => {
    expect(problemMessage(problem(0, 'X'), pt.errors)).toBe(pt.errors.network);
    expect(problemMessage(problem(400, 'X'), pt.errors)).toBe(pt.errors.validation);
    expect(problemMessage(problem(500, 'X'), pt.errors)).toBe(pt.errors.unavailable);
  });

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'Dado o code %s vindo do servidor, então cai na mensagem genérica (nunca num membro herdado)',
    (code) => {
      expect(problemMessage(problem(500, code), pt.errors)).toBe(pt.errors.unavailable);
    },
  );
});
