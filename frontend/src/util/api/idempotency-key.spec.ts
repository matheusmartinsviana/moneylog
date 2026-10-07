import { IdempotencyTracker, newIdempotencyKey } from '~/util/api/idempotency-key';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newIdempotencyKey', () => {
  it('Dado duas chamadas, então devolve UUID v4 diferentes', () => {
    const [a, b] = [newIdempotencyKey(), newIdempotencyKey()];

    expect(a).toMatch(UUID_V4);
    expect(b).toMatch(UUID_V4);
    expect(a).not.toBe(b);
  });

  it('Dado contexto sem randomUUID (http na LAN), então ainda devolve UUID v4', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(newIdempotencyKey()).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});

describe('IdempotencyTracker', () => {
  const problem = (status: number, code = 'X') => ({
    status,
    code,
    fieldErrors: [],
    traceId: null,
    retryAfterSeconds: null,
  });

  it('Dado falha ambígua (rede, 5xx, CONFLICT) e a mesma entrada, então reusa a chave', () => {
    for (const failure of [problem(0, 'NETWORK'), problem(503), problem(409, 'CONFLICT')]) {
      const tracker = new IdempotencyTracker<{ n: number }>();
      const first = tracker.begin({ n: 1 });
      tracker.failed(failure);

      expect(tracker.begin({ n: 1 })).toBe(first);
    }
  });

  it('Dado entrada diferente, então gera chave nova', () => {
    const tracker = new IdempotencyTracker<{ n: number }>();
    const first = tracker.begin({ n: 1 });
    tracker.failed(problem(0, 'NETWORK'));

    expect(tracker.begin({ n: 2 })).not.toBe(first);
  });

  it('Dado falha de regra (422) ou sucesso, então a próxima tentativa tem chave nova', () => {
    const tracker = new IdempotencyTracker<{ n: number }>();
    const first = tracker.begin({ n: 1 });
    tracker.failed(problem(422, 'DEBT_FIELD_REQUIRED'));
    const second = tracker.begin({ n: 1 });
    tracker.succeeded();

    expect(second).not.toBe(first);
    expect(tracker.begin({ n: 1 })).not.toBe(second);
  });
});
