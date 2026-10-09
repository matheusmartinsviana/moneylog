import { HttpRequest, HttpResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { DemoHttpBackend } from '~/demo/demo-backend';

async function get<T>(url: string): Promise<T> {
  const backend = new DemoHttpBackend();
  const event = (await firstValueFrom(
    backend.handle(new HttpRequest('GET', url)),
  )) as HttpResponse<T>;
  return event.body as T;
}

const cents = (m: { amount: string }) => Math.round(Number(m.amount) * 100);

describe('modo demonstração (backend de exemplo)', () => {
  it('Dado o mundo de exemplo, quando leio contas e painel, então o saldo em contas bate com a soma das contas', async () => {
    const accounts = await get<{ items: { type: string; currentBalance: { amount: string } }[] }>(
      '/v1/accounts',
    );
    const dash = await get<{ balances: { inAccounts: { amount: string } } }>(
      '/v1/dashboard/summary',
    );
    const sum = accounts.items
      .filter((a) => a.type !== 'INVESTMENT')
      .reduce((s, a) => s + cents(a.currentBalance), 0);
    expect(cents(dash.balances.inAccounts)).toBe(sum);
  });

  it('Dado o resumo do mês corrente, então ele bate com o painel e o gasto por categoria', async () => {
    const dash = await get<{ asOf: string; month: { consumption: { amount: string } } }>(
      '/v1/dashboard/summary',
    );
    const month = dash.asOf.slice(0, 7);
    const summary = await get<{ expenses: { amount: string } }>(`/v1/summaries/${month}`);
    const spending = await get<{ total: { amount: string } }>(
      `/v1/reports/spending-by-category?month=${month}&limit=5`,
    );
    expect(cents(summary.expenses)).toBe(cents(dash.month.consumption));
    expect(cents(spending.total)).toBe(cents(dash.month.consumption));
  });

  it('Dado as metas de exemplo, então há uma sem prazo (Fantasia), uma de dívidas com plano e uma atingida, com a medida igual à visão de dívidas', async () => {
    const goals = await get<{
      items: {
        kind: string;
        stage: string;
        name: string | null;
        metric: string | null;
        current: { amount: string } | null;
        planNote: string | null;
        streak: number;
        reached: boolean;
        consistency: { met: boolean | null }[];
      }[];
    }>('/v1/goals');
    const debts = await get<{ total: { amount: string } }>('/v1/debts/overview?months=6');

    expect(goals.items.some((g) => g.stage === 'FANTASY')).toBe(true);
    const plan = goals.items.find((g) => g.metric === 'TOTAL_DEBT')!;
    expect(plan).toMatchObject({ kind: 'METRIC', name: null, stage: 'STRATEGY', streak: 1 });
    expect(plan.planNote).not.toBeNull();
    expect(plan.consistency.map((m) => m.met)).toEqual([true, false, true, null]);
    expect(cents(plan.current!)).toBe(cents(debts.total));
    expect(goals.items.find((g) => g.reached)).toMatchObject({ stage: 'ACHIEVED' });
  });

  it('Dado qualquer alteração, então responde erro de modo demonstração', async () => {
    const backend = new DemoHttpBackend();
    await expect(
      firstValueFrom(backend.handle(new HttpRequest('POST', '/v1/accounts', {}))),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('Dado o mundo de exemplo, então há lotes de importação com linhas, contadores e marcas coerentes', async () => {
    const list = await get<{ items: { id: string; status: string; counts: { total: number } }[] }>(
      '/v1/imports',
    );
    expect(list.items.map((b) => b.status)).toEqual([
      'PENDING_REVIEW',
      'PENDING_REVIEW',
      'APPLIED',
    ]);

    const lines = await get<{
      items: { status: string; flags: string[]; requiresDecision: boolean }[];
    }>(`/v1/imports/${list.items[0]!.id}/lines`);
    expect(lines.items).toHaveLength(list.items[0]!.counts.total);
    expect(lines.items.some((l) => l.status === 'DUPLICATE')).toBe(true);
    expect(lines.items.some((l) => l.flags.includes('POSSIBLE_TRANSFER'))).toBe(true);
  });

  it('Dado as notificações de exemplo, então o contador bate com as não lidas e push está desligado', async () => {
    const list = await get<{ items: { readAt: string | null }[] }>('/v1/notifications');
    const count = await get<{ count: number }>('/v1/notifications/unread-count');
    expect(count.count).toBe(list.items.filter((n) => n.readAt === null).length);
    expect(count.count).toBeGreaterThan(0);
    expect(await get<{ enabled: boolean }>('/v1/push/config')).toMatchObject({ enabled: false });
  });

  it('Dado o demo, então a IA está desligada e os insights são calculados com os dados de exemplo', async () => {
    expect(await get<{ enabled: boolean }>('/v1/ai/status')).toMatchObject({ enabled: false });
    const insights = await get<{ items: { key: string; source: string }[] }>('/v1/insights');
    expect(insights.items.length).toBeGreaterThan(0);
    expect(insights.items.every((i) => i.source === 'COMPUTED')).toBe(true);
    expect(insights.items.every((i) => i.key.startsWith('insight.'))).toBe(true);
  });

  it('Dado a preferência da mensagem diária, então vale na sessão sem ligar a IA', async () => {
    const backend = new DemoHttpBackend();
    const put = (await firstValueFrom(
      backend.handle(new HttpRequest('PUT', '/v1/settings/ai', { dailyMessageEnabled: true })),
    )) as HttpResponse<{ dailyMessageEnabled: boolean }>;
    expect(put.body).toEqual({ dailyMessageEnabled: true });
  });

  it('Dado o demo, quando leio as dívidas totais, então o total fecha com as partes e o cronograma', async () => {
    const overview = await get<{
      total: { amount: string };
      parts: { cards: { amount: string }; people: { amount: string }; other: { amount: string } };
      hasRecords: boolean;
      schedule: {
        points: { total: { amount: string } }[];
        overdue: { amount: string };
        undated: { amount: string };
        beyondHorizon: { amount: string };
      };
    }>('/v1/debts/overview?months=12');
    expect(overview.hasRecords).toBe(true);
    expect(cents(overview.total)).toBe(
      cents(overview.parts.cards) + cents(overview.parts.people) + cents(overview.parts.other),
    );
    const scheduled = overview.schedule.points.reduce((s, p) => s + cents(p.total), 0);
    expect(
      scheduled +
        cents(overview.schedule.overdue) +
        cents(overview.schedule.undated) +
        cents(overview.schedule.beyondHorizon),
    ).toBe(cents(overview.total));
  });

  it('Dado a prévia do parcelado em andamento, então o demo devolve o que falta e não grava nada', async () => {
    const backend = new DemoHttpBackend();
    const preview = (await firstValueFrom(
      backend.handle(
        new HttpRequest('POST', '/v1/cards/c1/ongoing-installments/preview', {
          installmentAmount: '150.00',
          remainingInstallments: 8,
        }),
      ),
    )) as HttpResponse<{ remaining: { amount: string }; remainingInstallments: number }>;
    expect(preview.body?.remaining.amount).toBe('1200.00');
    await expect(
      firstValueFrom(
        backend.handle(new HttpRequest('POST', '/v1/cards/c1/ongoing-installments', {})),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  describe('metas de sonho com fotos sintéticas', () => {
    interface DemoGoal {
      id: string;
      name: string | null;
      kind: string;
      featured: boolean;
      coverPhotoId: string | null;
      photos: { id: string; position: number }[];
    }

    it('Dado o demo, então há duas metas de sonho e a que está em destaque tem 3 fotos geradas por código', async () => {
      const goals = await get<{ items: DemoGoal[] }>('/v1/goals');
      const dreams = goals.items.filter((g) => g.photos.length > 0);
      const featured = goals.items.filter((g) => g.featured);

      expect(dreams).toHaveLength(2);
      expect(featured).toHaveLength(1);
      expect(featured[0]).toMatchObject({ name: 'Carro de exemplo', kind: 'SAVINGS' });
      expect(featured[0]!.photos).toHaveLength(3);
      expect(featured[0]!.coverPhotoId).toBe(featured[0]!.photos[0]!.id);
      expect(
        goals.items.filter((g) => g.kind === 'METRIC').every((g) => g.photos.length === 0),
      ).toBe(true);
    });

    it('Dado featured=true, então a lista traz só a meta em destaque', async () => {
      const goals = await get<{ items: DemoGoal[] }>('/v1/goals?status=ACTIVE&featured=true');

      expect(goals.items.map((g) => g.name)).toEqual(['Carro de exemplo']);
    });

    it('Dado o conteúdo da foto, então devolve uma imagem SVG sintética (Blob), nunca um arquivo real', async () => {
      const goals = await get<{ items: DemoGoal[] }>('/v1/goals?featured=true');
      const goal = goals.items[0]!;

      const blob = await get<Blob>(
        `/v1/goals/${goal.id}/photos/${goal.photos[0]!.id}/content?variant=thumb`,
      );

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/svg+xml');
    });

    it('Dado uma foto que não existe, então 404', async () => {
      const goals = await get<{ items: DemoGoal[] }>('/v1/goals?featured=true');
      const backend = new DemoHttpBackend();

      await expect(
        firstValueFrom(
          backend.handle(
            new HttpRequest('GET', `/v1/goals/${goals.items[0]!.id}/photos/nao-existe/content`),
          ),
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('Dado enviar, reordenar, definir capa, remover ou destacar, então todas as escritas respondem 409 DEMO_MODE', async () => {
      const goals = await get<{ items: DemoGoal[] }>('/v1/goals?featured=true');
      const goal = goals.items[0]!;
      const photo = goal.photos[0]!.id;
      const backend = new DemoHttpBackend();
      const writes = [
        new HttpRequest('POST', `/v1/goals/${goal.id}/photos`, new FormData()),
        new HttpRequest('PUT', `/v1/goals/${goal.id}/photos/order`, { photoIds: [photo] }),
        new HttpRequest('PUT', `/v1/goals/${goal.id}/photos/${photo}/cover`, null),
        new HttpRequest('DELETE', `/v1/goals/${goal.id}/photos/${photo}`),
        new HttpRequest('PUT', `/v1/goals/${goal.id}/featured`, { featured: false }),
      ];

      for (const request of writes) {
        await expect(firstValueFrom(backend.handle(request))).rejects.toMatchObject({
          status: 409,
          error: { code: 'DEMO_MODE' },
        });
      }
    });
  });
});
