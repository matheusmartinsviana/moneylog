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
});
