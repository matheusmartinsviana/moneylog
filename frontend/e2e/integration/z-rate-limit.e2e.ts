/* eslint-disable @typescript-eslint/no-explicit-any */
import { Api } from '../support/api';

import { cy, expect, test } from './fixtures';

/**
 * T44: rate limit do login (5 falhas por IP em 15 min → 429 `TOO_MANY_ATTEMPTS` com `Retry-After`).
 * O contador é em memória do backend e **bloqueia o IP por 15 min**, inclusive para o login certo:
 * por isso este arquivo roda por último (`z-`) e só uma vez por backend. Com `E2E_STACK=external`,
 * reinicie o backend antes de rodar a suíte de novo.
 */
test('5 senhas erradas: 6ª tentativa é 429 com Retry-After, a tela avisa em minutos e o login certo também espera', async ({
  page,
  playwright,
  baseURL,
  net,
  evidence,
}) => {
  net.allow(401, 429);
  const raw = await playwright.request.newContext({ baseURL });
  const sink: any[] = [];
  const api = new Api(raw, sink);
  const email = process.env['E2E_OWNER_EMAIL'];
  for (let i = 1; i <= 5; i++) {
    const r = await api.call(
      'POST',
      '/v1/auth/login',
      { email, password: `errada-${i}` },
      { auth: false },
    );
    expect(r.status, `tentativa ${i}`).toBe(401);
    expect(r.body.code).toBe('INVALID_CREDENTIALS');
  }
  const blocked = await api.call(
    'POST',
    '/v1/auth/login',
    { email, password: 'errada-6' },
    { auth: false },
  );
  expect(blocked.status).toBe(429);
  expect(blocked.body.code).toBe('TOO_MANY_ATTEMPTS');
  const retryAfter = Number(blocked.headers['retry-after']);
  expect(
    Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 900,
    `Retry-After=${blocked.headers['retry-after']}`,
  ).toBe(true);
  expect(sink).toEqual([]);
  await raw.dispose();

  // Pela tela: a mensagem mostra os minutos que faltam, sem mexer na sessão.
  await page.goto('/login');
  await cy(page, 'login-email').fill(email ?? '');
  await cy(page, 'login-password').fill(process.env['E2E_OWNER_PASSWORD'] ?? '');
  await cy(page, 'login-submit').click();
  await expect(cy(page, 'login-error')).toContainText(/Tente de novo em \d+ min\./);
  const shown = await net.body('POST', '/v1/auth/login');
  expect(shown.code).toBe('TOO_MANY_ATTEMPTS');
  const minutes = Number(/(\d+) min/.exec(await cy(page, 'login-error').innerText())?.[1]);
  expect(minutes).toBe(
    Math.ceil(Number(net.find('POST', '/v1/auth/login').at(-1)!.headers?.['retry-after']) / 60),
  );
  await evidence(page, 'e2e-23-login-429');
});
