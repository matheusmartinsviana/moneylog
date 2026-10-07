/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Locator, Page, Request } from '@playwright/test';

import { expect, Lang, seedPreferences, test as base, waitForApp } from '../support';
import { Api, FailureSink, resetDatabase } from '../support/api';
import { ContractFailure, validateRequest, validateResponse } from '../support/contract';
import { expiredAccessToken, subjectOf } from '../support/jwt';

export { expect, resetDatabase, seedPreferences, waitForApp };
export type { Lang };

/** Pasta das capturas de evidência (só gravadas com `E2E_EVIDENCE=1`). */
export const EVIDENCE_DIR = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'qa',
  'evidencias',
  'etapa-2',
);

export interface SeenCall {
  method: string;
  url: URL;
  status: number | null;
  startedAt: number;
  endedAt: number;
  authorization: boolean;
  requestBody: unknown;
  responseBody: unknown;
  hasBody: boolean;
  /** `false` se a página fechou/navegou antes de o corpo chegar (nada a validar). */
  bodyRead: boolean;
  bodyError?: string;
  headers?: Record<string, string>;
  expiredTokenSent?: boolean;
  idempotencyKey?: string;
  dropped?: boolean;
}

/** Observador de rede do navegador: valida cada `/v1` contra o contrato e confere regras de rede. */
export class NetLog {
  readonly calls: SeenCall[] = [];
  readonly failures: ContractFailure[] = [];
  /** Chamadas (a qualquer origem) com `Authorization` fora de `/v1`. */
  readonly leakedAuthorization: string[] = [];
  private readonly pending: Promise<void>[] = [];
  private allowed = new Set<number>();
  checkDuplicates = true;
  /** O boot sem sessão faz um `POST /v1/auth/refresh` que responde 401 (esperado); testes de auth contam o 401 à parte. */
  allowAnonymousBoot = true;
  /** `true` derruba toda chamada a `/v1` (rede cortada): o `setOffline` do Chromium não vale para o que o Playwright intercepta. */
  offline = false;
  /** Os próximos N `/v1` (fora de `/v1/auth/*`) saem com um access token real, assinado e vencido. */
  private expireNext = 0;
  private expireSubject = '';
  /** Respostas descartadas depois de o backend processar (rede que cai na volta). */
  private drops: { match: RegExp; method: string; left: number }[] = [];
  /** Respostas injetadas sem chamar o backend (falha simulada de servidor). */
  private faults: { match: RegExp; method: string; status: number; left: number }[] = [];
  /** Rotas (prefixos) que o teste espera ver repetidas (ex.: o reenvio da mesma chave). */
  duplicateOk: string[] = [];

  constructor(page: Page, origin: string, intercept = true) {
    page.on('request', (req: Request) => {
      const url = new URL(req.url());
      const auth = req.headers()['authorization'];
      if (auth && !(url.origin === origin && url.pathname.startsWith('/v1'))) {
        this.leakedAuthorization.push(req.url());
      }
      if (auth && url.pathname.startsWith('/v1/auth/')) {
        this.leakedAuthorization.push(`${req.url()} (Authorization em /v1/auth/*)`);
      }
    });
    // Toda chamada a `/v1` passa por aqui: o Playwright faz a requisição real (contra o backend de
    // verdade, via proxy do `ng serve`) e entrega a resposta intacta ao navegador, guardando o corpo.
    // Ler `response.body()` no evento `response` falha de forma intermitente quando a SPA navega logo
    // depois da resposta (o Chromium descarta o corpo).
    if (!intercept) {
      page.on('response', (res) => {
        const url = new URL(res.url());
        if (url.origin !== origin || !url.pathname.startsWith('/v1')) return;
        this.calls.push({
          method: res.request().method(),
          url,
          status: res.status(),
          startedAt: Date.now(),
          endedAt: Date.now(),
          authorization: !!res.request().headers()['authorization'],
          requestBody: null,
          responseBody: null,
          hasBody: false,
          bodyRead: false,
        });
      });
    } else
      void page.route(
        (url) => url.origin === origin && url.pathname.startsWith('/v1'),
        async (route) => {
          const req = route.request();
          const url = new URL(req.url());
          if (this.offline) {
            await route.abort('internetdisconnected');
            return;
          }
          const call: SeenCall = {
            method: req.method(),
            url,
            status: null,
            startedAt: Date.now(),
            endedAt: 0,
            authorization: !!req.headers()['authorization'],
            idempotencyKey: req.headers()['idempotency-key'],
            requestBody: null,
            responseBody: null,
            hasBody: false,
            bodyRead: false,
          };
          try {
            call.requestBody = req.postDataJSON();
          } catch {
            call.requestBody = null;
          }
          this.calls.push(call);
          const fault = this.faults.find(
            (f) => f.left > 0 && f.method === req.method() && f.match.test(url.pathname),
          );
          if (fault) {
            fault.left--;
            call.status = fault.status;
            call.endedAt = Date.now();
            call.bodyRead = true;
            call.hasBody = true;
            call.responseBody = {
              type: 'urn:moneylog:problem:INTERNAL_ERROR',
              title: 'Internal Server Error',
              status: fault.status,
              code: 'INTERNAL_ERROR',
              detail: 'Erro interno.',
              instance: url.pathname,
              traceId: '00000000000000000000000000000000',
            };
            await route.fulfill({
              status: fault.status,
              contentType: 'application/problem+json',
              body: JSON.stringify(call.responseBody),
            });
            return;
          }
          const headers = { ...req.headers() };
          if (
            this.expireNext > 0 &&
            headers['authorization'] &&
            !url.pathname.startsWith('/v1/auth/')
          ) {
            this.expireNext--;
            headers['authorization'] = `Bearer ${expiredAccessToken(this.expireSubject)}`;
            call.expiredTokenSent = true;
          }
          try {
            const response = await route.fetch({ headers });
            const buffer = await response.body();
            call.status = response.status();
            call.headers = response.headers();
            call.endedAt = Date.now();
            call.bodyRead = true;
            const text = buffer.toString('utf8');
            call.hasBody = text.length > 0;
            try {
              call.responseBody = text ? JSON.parse(text) : null;
            } catch {
              call.responseBody = text;
            }
            const drop = this.drops.find(
              (d) => d.left > 0 && d.method === req.method() && d.match.test(url.pathname),
            );
            if (drop) {
              drop.left--;
              call.dropped = true;
              await route.abort('connectionreset');
              return;
            }
            await route.fulfill({ response });
          } catch (error) {
            call.bodyError = String(error);
            call.endedAt = Date.now();
            await route.abort().catch(() => undefined);
          }
        },
      );
  }

  forceExpiredToken(accessToken: string, count = 1): void {
    this.expireSubject = subjectOf(accessToken);
    this.expireNext = count;
  }

  /** O backend processa a próxima requisição, mas o navegador não recebe a resposta. */
  dropNextResponse(method: string, match: RegExp, times = 1): void {
    this.drops.push({ method, match, left: times });
  }

  /** Responde `status` (Problem do contrato) sem chamar o backend, `times` vezes. */
  failNext(method: string, match: RegExp, status = 500, times = 1): void {
    this.faults.push({ method, match, status, left: times });
  }

  /** Declara os status HTTP de erro que o teste provoca de propósito. */
  allow(...statuses: number[]): void {
    for (const s of statuses) this.allowed.add(s);
  }

  /** Chamadas a `/v1` que casam com `método` e caminho (prefixo). */
  find(method: string, path: string | RegExp): SeenCall[] {
    return this.calls.filter(
      (c) =>
        c.method === method &&
        (typeof path === 'string' ? c.url.pathname === path : path.test(c.url.pathname)),
    );
  }

  /** Corpo da última (ou da primeira) resposta que casa com `método` e caminho. */
  async body<T = any>(
    method: string,
    path: string | RegExp,
    which: 'first' | 'last' = 'last',
  ): Promise<T> {
    // A resposta pode ainda estar a caminho (a tela já mudou de URL, por exemplo): espera até 8 s.
    await expect
      .poll(
        async () => {
          await this.settle();
          return this.find(method, path).filter((c) => c.bodyRead).length;
        },
        { message: `resposta de ${method} ${String(path)}`, timeout: 8000 },
      )
      .toBeGreaterThan(0);
    // Respostas de requisições canceladas por uma navegação não têm corpo: ficam de fora.
    const found = this.find(method, path).filter((c) => c.bodyRead);
    const call = which === 'first' ? found[0] : found[found.length - 1];
    if (!call) throw new Error(`nenhuma resposta de ${method} ${String(path)} capturada`);
    if (!call.bodyRead)
      throw new Error(`corpo de ${method} ${String(path)} indisponível: ${call.bodyError}`);
    return call.responseBody as T;
  }

  async settle(): Promise<void> {
    await Promise.all(this.pending);
  }

  async verify(): Promise<string[]> {
    await this.settle();
    const problems: string[] = [];
    for (const c of this.calls) {
      if (c.status === null) continue;
      const path = c.url.pathname;
      if (c.bodyRead)
        for (const f of validateResponse(c.method, path, c.status, c.responseBody, c.hasBody)) {
          problems.push(`contrato: ${f.where}: ${f.detail}`);
        }
      if (c.requestBody !== null && c.bodyRead) {
        for (const f of validateRequest(c.method, path, c.requestBody)) {
          problems.push(`contrato: ${f.where}: ${f.detail}`);
        }
      }
      const bootRefresh =
        c.method === 'POST' &&
        path === '/v1/auth/refresh' &&
        c.status === 401 &&
        this.allowAnonymousBoot;
      if (c.status >= 400 && !this.allowed.has(c.status) && !bootRefresh) {
        problems.push(`status inesperado: ${c.method} ${path} -> ${c.status}`);
      }
    }
    for (const leak of this.leakedAuthorization) problems.push(`Authorization vazou para ${leak}`);
    if (this.checkDuplicates) {
      // Duplicada = a mesma requisição GET começou enquanto a anterior ainda estava em voo.
      const seen = new Map<string, number>();
      for (const c of [...this.calls].sort((a, b) => a.startedAt - b.startedAt)) {
        if (c.method !== 'GET') continue;
        if (this.duplicateOk.some((p) => c.url.pathname.startsWith(p))) continue;
        const key = c.url.pathname + c.url.search;
        const last = seen.get(key);
        if (last !== undefined && c.startedAt < last) {
          problems.push(`requisição duplicada: GET ${key} (a anterior ainda estava em voo)`);
        }
        seen.set(key, c.endedAt);
      }
    }
    return problems;
  }
}

interface Fixtures {
  /** `false`: sem interceptar `/v1` (rede 100% nativa do navegador); só status, sem corpo. */
  interceptApi: boolean;
  /** Cliente da API real (login próprio, cookies separados do navegador), validado pelo contrato. */
  api: Api;
  net: NetLog;
  /** Entra pela API no contexto do navegador (o cookie `ml_refresh` fica no navegador). */
  signIn: (page?: Page) => Promise<Api>;
  evidence: (page: Page, name: string) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  interceptApi: [true, { option: true }],
  api: async ({ playwright, baseURL }, use) => {
    const request = await playwright.request.newContext({ baseURL });
    const sink: FailureSink = [];
    const api = new Api(request, sink);
    await api.login();
    await use(api);
    await request.dispose();
    expect(
      sink.map((f) => `${f.where}: ${f.detail}`),
      'contrato das chamadas de apoio',
    ).toEqual([]);
  },
  net: [
    async ({ page, baseURL, interceptApi }, use) => {
      const net = new NetLog(page, new URL(baseURL ?? 'http://localhost').origin, interceptApi);
      await use(net);
      expect(await net.verify(), 'rede: contrato, status, Authorization e duplicadas').toEqual([]);
    },
    { auto: true },
  ],
  signIn: async ({ page, baseURL }, use) => {
    await use(async (target = page) => {
      const sink: FailureSink = [];
      const api = new Api(target.context().request, sink);
      await api.login();
      expect(sink).toEqual([]);
      void baseURL;
      return api;
    });
  },
  evidence: async ({}, use, testInfo) => {
    await use(async (page, name) => {
      if (!process.env['E2E_EVIDENCE']) return;
      // As capturas da Etapa 3 (`cards.e2e.ts`) vão para a pasta própria.
      const dir = testInfo.file.endsWith('cards.e2e.ts')
        ? EVIDENCE_DIR.replace(/etapa-2$/, 'etapa-3')
        : EVIDENCE_DIR;
      mkdirSync(dir, { recursive: true });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: resolve(dir, `${name}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    });
  },
});

/** Texto visível normalizado: NBSP vira espaço comum. */
export const norm = (s: string): string =>
  s
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** O que o front exibe para um valor da API (`formatMoney`: pt-BR, `R$`, menos tipográfico). */
export function fmt(amount: string): string {
  const neg = amount.startsWith('-');
  const abs = neg ? amount.slice(1) : amount;
  const [int = '0', frac = '00'] = abs.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const isZero = /^0+(\.0+)?$/.test(abs);
  return `${neg && !isZero ? '−' : ''}R$ ${grouped},${frac.padEnd(2, '0')}`;
}

/** Texto de um `data-cy` (primeiro elemento), normalizado. */
export async function cyText(page: Page, cy: string): Promise<string> {
  const el = page.locator(`[data-cy="${cy}"]`).first();
  await expect(el).toBeVisible();
  return norm(await el.innerText());
}

/** Totais da lista: a variante visível (resumo no topo no celular, rodapé nas telas largas). */
export async function totalsText(page: Page, part: string): Promise<string> {
  const el = page
    .locator(`[data-cy="totals-footer-${part}"], [data-cy="totals-summary-${part}"]`)
    .filter({ visible: true })
    .first();
  await expect(el).toBeVisible();
  return norm(await el.innerText());
}

export const cy = (page: Page, id: string): Locator => page.locator(`[data-cy="${id}"]`);

/** Preenche o campo de valor (texto pt-BR, ex.: `1.000,00`). */
export async function fillAmount(page: Page, amount: string): Promise<void> {
  const input = cy(page, 'entry-amount');
  await input.fill(amount);
  await input.blur();
}

/** Escolhe uma opção de um `app-select` pelo texto visível. */
export async function pick(page: Page, fieldId: string, label: string): Promise<void> {
  await cy(page, fieldId).click();
  await cy(page, `${fieldId}-listbox`).getByRole('option', { name: label, exact: true }).click();
}

/** Escolhe uma opção de um `app-select` pelo valor (`data-cy="<campo>-option-<valor>"`). */
export async function pickValue(page: Page, fieldId: string, value: string): Promise<void> {
  await cy(page, fieldId).click();
  await cy(page, `${fieldId}-option-${value}`).click();
}

/** Abre o painel de filtros (um `<details>`: já vem aberto em telas largas). */
export async function openFilters(page: Page): Promise<void> {
  const toggle = cy(page, 'filters-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

/** Entra pelo formulário de login. */
export async function loginViaUi(page: Page): Promise<void> {
  await cy(page, 'login-email').fill(process.env['E2E_OWNER_EMAIL'] ?? '');
  await cy(page, 'login-password').fill(process.env['E2E_OWNER_PASSWORD'] ?? '');
  await cy(page, 'login-submit').click();
}

/** Navega e espera o app (título da página). */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForApp(page);
}

export type { Api };
