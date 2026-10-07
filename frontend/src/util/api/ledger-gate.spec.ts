import { Subject } from 'rxjs';

import { LedgerGate } from '~/util/api/ledger-gate';

describe('LedgerGate', () => {
  it('Dado 4 leituras e limite 2, então só 2 estão em voo e as outras esperam na ordem', () => {
    const gate = new LedgerGate(2);
    const sources = [0, 1, 2, 3].map(() => new Subject<string>());
    const started: number[] = [];
    sources.forEach((source, i) => {
      gate.run(source).subscribe({ next: () => started.push(i) });
    });
    expect(gate.inFlight).toBe(2);
    expect(gate.waiting).toBe(2);
    expect(sources.map((s) => s.observed)).toEqual([true, true, false, false]);

    sources[0]!.next('a');
    sources[0]!.complete();
    expect(gate.inFlight).toBe(2);
    expect(sources[2]!.observed).toBe(true);
    expect(sources[3]!.observed).toBe(false);
    expect(started).toEqual([0]);
  });

  it('Dado prioridades diferentes, então a menor prioridade começa primeiro quando abre uma vaga', () => {
    const gate = new LedgerGate(1);
    const first = new Subject<string>();
    const low = new Subject<string>();
    const high = new Subject<string>();
    gate.run(first).subscribe();
    gate.run(low, 5).subscribe();
    gate.run(high, 1).subscribe();

    first.complete();

    expect(high.observed).toBe(true);
    expect(low.observed).toBe(false);
  });

  it('Dado uma leitura que falha, então a vaga volta e o erro chega ao assinante', () => {
    const gate = new LedgerGate(1);
    const failing = new Subject<string>();
    const next = new Subject<string>();
    const errors: unknown[] = [];
    gate.run(failing).subscribe({ error: (e: unknown) => errors.push(e) });
    gate.run(next).subscribe();
    expect(next.observed).toBe(false);

    failing.error(new Error('boom'));

    expect(errors).toHaveLength(1);
    expect(next.observed).toBe(true);
    expect(gate.inFlight).toBe(1);
  });

  it('Dado um cancelamento, então a leitura em voo libera a vaga e a que esperava nunca é assinada', () => {
    const gate = new LedgerGate(1);
    const running = new Subject<string>();
    const waiting = new Subject<string>();
    const after = new Subject<string>();
    const runningSub = gate.run(running).subscribe();
    const waitingSub = gate.run(waiting).subscribe();
    gate.run(after).subscribe();

    waitingSub.unsubscribe();
    expect(gate.waiting).toBe(1);

    runningSub.unsubscribe();
    expect(running.observed).toBe(false);
    expect(waiting.observed).toBe(false);
    expect(after.observed).toBe(true);
  });

  it('Dado o mesmo cancelamento repetido, então a vaga não é liberada duas vezes', () => {
    const gate = new LedgerGate(2);
    const a = new Subject<string>();
    const sub = gate.run(a).subscribe();
    a.complete();
    sub.unsubscribe();
    expect(gate.inFlight).toBe(0);
  });
});
