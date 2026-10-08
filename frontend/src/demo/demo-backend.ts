import {
  HttpBackend,
  HttpErrorResponse,
  HttpEvent,
  HttpHeaders,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { delay, Observable, of, throwError } from 'rxjs';

import { aiStatus, insightsView } from '~/demo/demo-ai';
import { addDays, localToday } from '~/demo/demo-dates';
import { debtOverviewView, ongoingPreviewView } from '~/demo/demo-debts';
import {
  dailyMessage,
  importBatches,
  notificationList,
  notificationSettings,
  reminderList,
} from '~/demo/demo-etapa7';
import { goalView } from '~/demo/demo-goals';
import { commitmentViews, thirdPartyReceivablesView } from '~/demo/demo-third-parties';
import {
  accountView,
  cardView,
  noLimitCardView,
  categoryView,
  currentInvoice,
  dashboardView,
  debtView,
  futureInstallments,
  incomeExpenses,
  invoiceSummary,
  invoiceView,
  listEntries,
  listOccurrences,
  listTransactions,
  noteSummary,
  noteView,
  norm,
  paged,
  personDetail,
  personView,
  projectionView,
  recurrenceSummary,
  recurrenceView,
  searchView,
  spendingByCategory,
  summaryView,
  txView,
  upcomingView,
} from '~/demo/demo-views';
import { buildWorld, money, type S, type World } from '~/demo/demo-world';

class NotFound extends Error {}

const DEMO_ERROR = { status: 409, code: 'DEMO_MODE' } as const;

/**
 * Backend de demonstração: responde a `/v1/*` com o mundo fictício e nunca sai da página. Leituras
 * funcionam; qualquer alteração responde `409 DEMO_MODE` (as alterações não são salvas). Substitui o
 * `HttpBackend` só no build `demo`; as facades de requisições e os mappers rodam como em produção.
 */
@Injectable()
export class DemoHttpBackend extends HttpBackend {
  private world: World | null = null;
  private dailyAi = false;

  private get w(): World {
    this.world ??= buildWorld(localToday());
    return this.world;
  }

  handle(req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    try {
      const url = new URL(req.urlWithParams, 'http://demo.local');
      const body = this.route(req, url);
      return of(new HttpResponse({ status: body === null ? 204 : 200, body, url: req.url })).pipe(
        delay(120),
      );
    } catch (error) {
      if (error instanceof NotFound) return this.problem(req, 404, 'NOT_FOUND');
      return this.problem(req, DEMO_ERROR.status, DEMO_ERROR.code);
    }
  }

  private problem(req: HttpRequest<unknown>, status: number, code: string): Observable<never> {
    const body = {
      type: 'about:blank',
      title: 'Modo demonstração',
      status,
      code,
      traceId: 'demo',
    };
    const error =
      req.responseType === 'blob'
        ? new Blob([JSON.stringify(body)], { type: 'application/problem+json' })
        : body;
    return throwError(
      () =>
        new HttpErrorResponse({
          status,
          error,
          url: req.url,
          headers: new HttpHeaders({ 'Content-Type': 'application/problem+json' }),
        }),
    ).pipe(delay(120));
  }

  private route(req: HttpRequest<unknown>, url: URL): unknown {
    const w = this.w;
    const path = url.pathname;
    const q = url.searchParams;
    const num = (key: string, fallback: number) => {
      const value = Number(q.get(key));
      return Number.isFinite(value) && value > 0 ? value : fallback;
    };
    const page = num('page', 1);
    const pageSize = num('pageSize', 50);

    if (req.method === 'POST' && path === '/v1/auth/login') return this.token();
    if (req.method === 'POST' && path === '/v1/auth/refresh') return this.token();
    if (req.method === 'POST' && path === '/v1/auth/logout') return null;

    const preview = /^\/v1\/cards\/[^/]+\/purchase-preview$/.exec(path);
    if (req.method === 'POST' && preview)
      return this.purchasePreview(
        req.body as { amount: string; installments: number; date: string },
      );

    // Prévia do parcelado em andamento: o "servidor" do demo calcula o que falta (nada é gravado).
    const ongoingPreview = /^\/v1\/cards\/[^/]+\/ongoing-installments\/preview$/.exec(path);
    if (req.method === 'POST' && ongoingPreview)
      return ongoingPreviewView(
        w,
        req.body as { installmentAmount: string; remainingInstallments: number },
      );

    // O envio de um extrato devolve o lote de exemplo em revisão (as demais escritas seguem recusadas).
    if (req.method === 'POST' && path === '/v1/imports') return importBatches(w)[0]!.batch;

    // A preferência da mensagem diária vale só nesta sessão (a IA do demo está desligada; nada é enviado).
    if (req.method === 'PUT' && path === '/v1/settings/ai') {
      this.dailyAi = (req.body as { dailyMessageEnabled: boolean }).dailyMessageEnabled;
      return { dailyMessageEnabled: this.dailyAi };
    }

    if (req.method !== 'GET') throw new Error('demo-read-only');

    // ---- Painel
    if (path === '/v1/dashboard/summary') return dashboardView(w);
    if (path === '/v1/dashboard/upcoming') return upcomingView(w);
    if (path === '/v1/reports/income-expenses')
      return incomeExpenses(w, (q.get('period') ?? 'D30') as S['ReportPeriod']);
    if (path === '/v1/reports/spending-by-category')
      return spendingByCategory(w, q.get('month') ?? w.month, num('limit', 5));
    if (path === '/v1/projections')
      return projectionView(
        w,
        (q.get('horizon') ?? 'M6') as S['ProjectionHorizon'],
        q.get('includeTrend') === 'true',
      );
    const summary = /^\/v1\/summaries\/(\d{4}-\d{2})$/.exec(path);
    if (summary) return summaryView(w, summary[1]!);
    if (path === '/v1/search') return searchView(w, q.get('q') ?? '');

    // ---- Contas e categorias
    if (path === '/v1/accounts') {
      const list = w.accounts.map((a) => accountView(w, a));
      return paged(q.get('status') === 'ARCHIVED' ? [] : list, page, pageSize);
    }
    const account = /^\/v1\/accounts\/([^/]+)$/.exec(path);
    if (account) return accountView(w, this.find(w.accounts, account[1]!));
    if (path === '/v1/categories')
      return categoryView(w).filter((c) => !q.get('kind') || c.kind === q.get('kind'));

    // ---- Movimentações
    if (path === '/v1/transactions') {
      return listTransactions(
        w,
        {
          from: q.get('from'),
          to: q.get('to'),
          type: q.get('type'),
          accountId: q.get('accountId'),
          categoryId: q.get('categoryId'),
          method: q.get('method'),
          q: q.get('q'),
        },
        page,
        pageSize,
      );
    }
    const tx = /^\/v1\/transactions\/([^/]+)$/.exec(path);
    if (tx) return txView(w, this.find(w.recs, tx[1]!));
    if (path === '/v1/entries') {
      return listEntries(
        w,
        {
          competence: q.get('competence') ?? w.month,
          lens: q.get('lens') ?? 'CONSUMPTION',
          accountId: q.get('accountId'),
          categoryId: q.get('categoryId'),
          method: q.get('method'),
        },
        page,
        pageSize,
      );
    }

    // ---- Cartões e faturas
    if (path === '/v1/cards')
      return paged(
        q.get('status') === 'ARCHIVED' ? [] : [cardView(w), noLimitCardView(w)],
        page,
        pageSize,
      );
    const card = /^\/v1\/cards\/([^/]+)(?:\/([a-z-]+))?$/.exec(path);
    if (card) {
      const noLimit = noLimitCardView(w);
      if (card[1] === noLimit.id) {
        if (card[2] === undefined) return noLimit;
        if (card[2] === 'invoices') return paged([], page, pageSize);
        if (card[2] === 'future-installments') return { total: money(0), byInvoice: [] };
        throw new NotFound();
      }
      if (card[1] !== w.card.id) throw new NotFound();
      switch (card[2]) {
        case undefined:
          return cardView(w);
        case 'invoices': {
          const from = q.get('from')?.slice(0, 7);
          const to = q.get('to')?.slice(0, 7);
          const list = w.invoices
            .filter((i) => (!from || i.ref >= from) && (!to || i.ref <= to))
            .sort((a, b) => (a.ref < b.ref ? 1 : -1))
            .map((i) => invoiceSummary(w, i));
          return paged(list, page, pageSize);
        }
        case 'future-installments':
          return futureInstallments(w);
        case 'billing-change-preview':
          return this.billingPreview(Number(q.get('closingDay')), Number(q.get('dueDay')));
        default:
          throw new NotFound();
      }
    }
    const invoice = /^\/v1\/invoices\/([^/]+)(?:\/(payment-preview))?$/.exec(path);
    if (invoice) {
      const inv = this.find(w.invoices, invoice[1]!);
      if (!invoice[2]) return invoiceView(w, inv);
      const cents = Math.round(Number(q.get('amount')) * 100);
      const outstanding = inv.total - inv.paid;
      return {
        kind: cents === outstanding ? 'FULL' : cents > outstanding ? 'OVERPAY' : 'PARTIAL',
        outstandingAfter: money(Math.max(outstanding - cents, 0)),
        creditCarryAfter: money(Math.max(cents - outstanding, 0)),
      } satisfies S['PaymentPreview'];
    }

    // ---- Pessoas e dívidas
    if (path === '/v1/people') {
      const term = norm(q.get('q') ?? '');
      const list = w.people
        .filter((p) => !term || norm(p.name).includes(term))
        .map((p) => personView(w, p));
      return paged(q.get('status') === 'ARCHIVED' ? [] : list, page, pageSize);
    }
    const person = /^\/v1\/people\/([^/]+)$/.exec(path);
    if (person) return personDetail(w, this.find(w.people, person[1]!));
    if (path === '/v1/debts') {
      const list = w.debts
        .filter(
          (d) =>
            (!q.get('direction') || d.direction === q.get('direction')) &&
            (!q.get('personId') || d.personId === q.get('personId')) &&
            (!q.get('status') || debtView(w, d).status === q.get('status')) &&
            (q.get('overdue') === null || debtView(w, d).overdue === (q.get('overdue') === 'true')),
        )
        .map((d) => debtView(w, d));
      return paged(list, page, pageSize);
    }
    if (path === '/v1/debts/overview') return debtOverviewView(w, num('months', 12));
    if (path === '/v1/debts/third-party-receivables')
      return thirdPartyReceivablesView(w, q.get('month'));
    if (path === '/v1/commitments') {
      const list = commitmentViews(w);
      return paged(list, page, pageSize);
    }
    const commitment = /^\/v1\/commitments\/([^/]+)$/.exec(path);
    if (commitment) return this.find(commitmentViews(w), commitment[1]!);
    const debt = /^\/v1\/debts\/([^/]+)$/.exec(path);
    if (debt) return debtView(w, this.find(w.debts, debt[1]!));

    // ---- Recorrências
    if (path === '/v1/recurrences') {
      const active = q.get('active');
      return paged(
        active === 'false' ? [] : w.recurrences.map((r) => recurrenceView(w, r)),
        page,
        pageSize,
      );
    }
    if (path === '/v1/recurrences/summary') return recurrenceSummary(w);
    if (path === '/v1/recurrences/occurrences') {
      const list = listOccurrences(w, q.get('from'), q.get('to'), q.get('status'));
      return { ...paged(list, page, pageSize), overdueTruncated: false };
    }
    const recurrence = /^\/v1\/recurrences\/([^/]+)$/.exec(path);
    if (recurrence) return recurrenceView(w, this.find(w.recurrences, recurrence[1]!));

    // ---- Metas
    if (path === '/v1/goals') {
      const status = q.get('status');
      const list = w.goals.map((g) => goalView(w, g)).filter((g) => !status || g.status === status);
      return paged(list, page, pageSize);
    }
    const goal = /^\/v1\/goals\/([^/]+)$/.exec(path);
    if (goal) return goalView(w, this.find(w.goals, goal[1]!));

    // ---- Notas
    if (path === '/v1/notes') {
      const term = norm(q.get('q') ?? '');
      const tag = q.get('tag');
      const folder = q.get('folder');
      let list = q.get('status') === 'TRASHED' ? [] : w.notes;
      list = list.filter(
        (n) =>
          (!term || norm(`${n.path} ${n.body}`).includes(term)) &&
          (!tag || n.tags.includes(tag)) &&
          (!folder || n.path.startsWith(`${folder}/`)),
      );
      const sort = q.get('sort');
      list = [...list].sort((a, b) =>
        sort === 'TITLE' || sort === 'PATH'
          ? a.path < b.path
            ? -1
            : 1
          : a.updatedAt < b.updatedAt
            ? 1
            : -1,
      );
      return paged(list.map(noteSummary), page, pageSize);
    }
    if (path === '/v1/notes/tags') {
      const counts = new Map<string, number>();
      for (const n of w.notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      return [...counts.entries()].map(([tag, count]) => ({ tag, count }));
    }
    if (path === '/v1/links') {
      const id = q.get('targetId');
      const list = w.notes.filter((n) =>
        n.links.some((l) => l.type === q.get('targetType') && l.target?.id === id),
      );
      return paged(list.map(noteSummary), page, pageSize);
    }
    const noteBack = /^\/v1\/notes\/([^/]+)\/backlinks$/.exec(path);
    if (noteBack) return { items: [], hasNext: false };
    const note = /^\/v1\/notes\/([^/]+)$/.exec(path);
    if (note) return noteView(this.find(w.notes, note[1]!));

    // ---- Importação de extrato (Etapa 7)
    if (path === '/v1/imports') {
      const status = q.get('status');
      const list = importBatches(w)
        .map((b) => b.batch)
        .filter((b) => !status || b.status === status);
      return paged(list, page, pageSize);
    }
    const imported = /^\/v1\/imports\/([^/]+)(?:\/(lines))?$/.exec(path);
    if (imported) {
      const found = importBatches(w).find((b) => b.batch.id === imported[1]);
      if (!found) throw new NotFound();
      if (!imported[2]) return found.batch;
      const status = q.get('status');
      const flag = q.get('flag');
      const lines = found.lines.filter(
        (l) =>
          (!status || l.status === status) &&
          (!flag || l.flags.includes(flag as S['ImportLineFlag'])),
      );
      return paged(lines, page, pageSize);
    }
    if (/^\/v1\/import-mappings\/[^/]+$/.test(path)) throw new NotFound();

    // ---- Notificações, lembretes, configurações, push e mensagem do dia (Etapa 7)
    if (path === '/v1/notifications') {
      const unreadOnly = q.get('status') === 'UNREAD';
      const kind = q.get('kind');
      const list = notificationList(w).filter(
        (n) => (!unreadOnly || n.readAt === null) && (!kind || n.kind === kind),
      );
      return paged(list, page, pageSize);
    }
    if (path === '/v1/notifications/unread-count') {
      return { count: notificationList(w).filter((n) => n.readAt === null).length };
    }
    if (path === '/v1/reminders') {
      return paged(reminderList(w, q.get('includeDone') === 'true'), page, pageSize);
    }
    if (path === '/v1/settings/notifications') return notificationSettings();
    if (path === '/v1/push/config') return { enabled: false, publicKey: null };
    if (path === '/v1/daily-message') return dailyMessage(w);

    // ---- IA (Etapa 8): desligada no demo; os insights são calculados com os dados de exemplo
    if (path === '/v1/ai/status') return aiStatus();
    if (path === '/v1/ai/analyses') return { items: [], hasNext: false };
    if (path === '/v1/insights') return insightsView(w, q.get('month') ?? w.month);
    if (path === '/v1/settings/ai') return { dailyMessageEnabled: this.dailyAi };

    throw new NotFound();
  }

  private find<T extends { id: string }>(list: T[], id: string): T {
    const found = list.find((x) => x.id === id);
    if (!found) throw new NotFound();
    return found;
  }

  private token(): S['AuthToken'] {
    return { accessToken: 'demo-session', expiresAt: `${addDays(localToday(), 1)}T12:00:00Z` };
  }

  private purchasePreview(input: {
    amount: string;
    installments: number;
    date: string;
  }): S['PurchasePreview'] {
    const w = this.w;
    const total = Math.round(Number(input.amount) * 100);
    const n = Math.max(1, input.installments);
    const base = Math.floor(total / n);
    const cur = currentInvoice(w) ?? w.invoices[w.invoices.length - 1]!;
    const card = cardView(w);
    const available = Math.round(Number(card.availableLimit?.amount ?? '0') * 100) - total;
    return {
      installments: Array.from({ length: n }, (_, i) => ({
        number: i + 1,
        total: n,
        amount: money(i === 0 ? total - base * (n - 1) : base),
        competence: cur.ref,
        invoice: {
          id: cur.id,
          referenceMonth: cur.ref,
          closingDate: cur.closingDate,
          dueDate: cur.dueDate,
          status: cur.status,
        },
        lateEntry: false,
      })),
      total: money(total),
      availableLimitAfter: money(available),
      overLimit: available < 0,
      warnings: available < 0 ? ['OVER_LIMIT'] : [],
    };
  }

  private billingPreview(closingDay: number, dueDay: number): S['BillingChangePreview'] {
    const w = this.w;
    const cur = currentInvoice(w) ?? w.invoices[w.invoices.length - 1]!;
    const month = cur.ref;
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      effectiveFromClosingDate: cur.closingDate,
      firstNewInvoice: {
        closingDate: `${month}-${pad(closingDay)}`,
        dueDate: `${month}-${pad(dueDay)}`,
      },
      movedInstallments: 0,
      movedCredits: 0,
      notice: 'FROM_NEXT_INVOICE',
    };
  }
}
