import { CANVAS, expect, test, VIEWPORTS, waitForApp } from './support';

/**
 * T18 e T20 CA 4: instalabilidade com o build de produção servido (projeto `prod`).
 * Usa a mesma checagem do Chrome DevTools → Application (CDP `Page.getInstallabilityErrors`),
 * já que o Lighthouse atual não tem mais a categoria PWA.
 */

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
}

/** Lê largura e altura do cabeçalho IHDR de um PNG. */
function pngSize(buffer: Buffer): { width: number; height: number } {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function rgbToHex(rgb: string): string {
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
  return '#' + [r, g, b].map((n) => n!.toString(16).padStart(2, '0')).join('');
}

test.use({ viewport: VIEWPORTS.mobile });

test('manifest válido, ícones 192/512 e maskable, cores iguais ao canvas claro', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await waitForApp(page);

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('manifest.webmanifest');
  const res = await request.get(`/${href}`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('manifest+json');
  const manifest = (await res.json()) as Manifest;

  expect(manifest.name).toBe('moneylog');
  expect(manifest.short_name).toBe('moneylog');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('./');
  expect(manifest.scope).toBe('./');
  expect(manifest.background_color).toBe(rgbToHex(CANVAS.light));
  expect(manifest.theme_color).toBe(rgbToHex(CANVAS.light));

  for (const icon of manifest.icons) {
    const iconRes = await request.get(`/${icon.src}`);
    expect(iconRes.status(), icon.src).toBe(200);
    if (icon.type === 'image/png') {
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(await iconRes.body()), icon.src).toEqual({ width: w, height: h });
    }
  }
  const png = manifest.icons.filter((i) => i.type === 'image/png');
  expect(png.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
  expect(png.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
  expect(png.some((i) => i.purpose === 'maskable')).toBe(true);

  // iOS: apple-touch-icon 180×180 e metas.
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  const appleRes = await request.get(`/${apple}`);
  expect(pngSize(await appleRes.body())).toEqual({ width: 180, height: 180 });
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes',
  );
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  );
  await expect(
    page.locator('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]'),
  ).toHaveAttribute('content', rgbToHex(CANVAS.dark));
});

test('service worker ativo e o Chrome não aponta erro de instalabilidade', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  // registrationStrategy: registerWhenStable:30000 (no pior caso registra em 30 s).
  const scope = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('SW não ficou ativo em 40 s')), 40_000);
        void navigator.serviceWorker.ready.then((reg) => {
          clearTimeout(timer);
          resolve(reg.scope);
        });
      }),
  );
  expect(scope).toMatch(/^http:\/\/localhost:\d+\/$/);
  const scriptURL = await page.evaluate(
    async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL,
  );
  expect(scriptURL).toMatch(/sw-push\.js$/);

  // Recarrega já controlado pelo SW, como o Chrome faz antes de oferecer a instalação.
  await page.reload();
  await waitForApp(page);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  const cdp = await page.context().newCDPSession(page);
  const manifest = (await cdp.send('Page.getAppManifest')) as {
    errors: { message: string; critical: number }[];
  };
  expect(manifest.errors).toEqual([]);
  const installability = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  test.info().annotations.push({
    type: 'installability',
    description: JSON.stringify(installability.installabilityErrors),
  });
  expect(installability.installabilityErrors).toEqual([]);
});

test('ngsw.json: app shell, CSS, JS e fontes em prefetch; sem dataGroups para /v1', async ({
  request,
}) => {
  const ngsw = (await (await request.get('/ngsw.json')).json()) as {
    assetGroups: { name: string; installMode: string; urls: string[] }[];
    dataGroups?: unknown[];
  };
  expect(ngsw.dataGroups ?? []).toEqual([]);
  const prefetch = ngsw.assetGroups
    .filter((g) => g.installMode === 'prefetch')
    .flatMap((g) => g.urls);
  expect(prefetch).toContain('/index.html');
  expect(prefetch.some((u) => /\/main-.*\.js$/.test(u))).toBe(true);
  expect(prefetch.some((u) => /\/styles-.*\.css$/.test(u))).toBe(true);
  expect(prefetch.some((u) => /\/media\/geist-latin-wght.*\.woff2$/.test(u))).toBe(true);
  expect(prefetch.some((u) => /\/media\/geist-mono-latin-wght.*\.woff2$/.test(u))).toBe(true);
  const images = ngsw.assetGroups.find((g) => g.name === 'images');
  expect(images?.installMode).toBe('lazy');
});

test('offline depois da primeira carga: o shell abre e as fontes vêm do cache', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await waitForApp(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Espera o SW terminar o prefetch (o ngsw só serve offline depois de instalar os assets).
  await page.reload();
  await waitForApp(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.waitForTimeout(1500);

  await context.setOffline(true);
  await page.goto('/cards');
  await waitForApp(page);
  await expect(page.locator('[data-cy="page-title"]')).toHaveText('Cartões');
  // O Geist é o fallback da pilha (a SF vem primeiro em aparelho Apple e o Geist nem seria usado): pede-se
  // o Geist de propósito para provar que o service worker o serve offline (prefetch no `ngsw-config.json`).
  await page.evaluate(() => document.fonts.load('16px "Geist Variable"'));
  const geist = await page.evaluate(() =>
    [...document.fonts].some((f) => /Geist/.test(f.family) && f.status === 'loaded'),
  );
  expect(geist).toBe(true);
  await context.setOffline(false);
});
