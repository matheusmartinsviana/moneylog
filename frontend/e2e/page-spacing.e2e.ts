import { expect, test, waitForApp } from './support';

/**
 * Espaçamento uniforme (ritmo único de página): em 375, 768, 1280 e 1440 px, o primeiro bloco de conteúdo
 * (`h1` e `[data-cy=page-content]`) de toda rota principal começa e termina nas mesmas bordas, e o cabeçalho do
 * workspace usa a mesma borda esquerda e direita. Tolerância de 1 px (arredondamento de subpixel).
 */
const ROUTES = [
  '/',
  '/transactions',
  '/accounts',
  '/cards',
  '/goals',
  '/planning',
  '/people',
  '/notes',
  '/vault',
  '/ai',
  '/mcp',
  '/settings',
  '/import',
  '/notifications',
  '/budgets',
  '/insights',
];
const WIDTHS = [375, 768, 1280, 1440];

for (const width of WIDTHS) {
  test(`mesma margem lateral em todas as telas (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const boxes: Record<string, { left: number; right: number }> = {};
    let header: { left: number; right: number } | null = null;
    for (const route of ROUTES) {
      await page.goto(route);
      await waitForApp(page);
      const content = await page.locator('[data-cy="page-content"]').first().boundingBox();
      const title = await page.locator('h1').first().boundingBox();
      expect(content, `${route}: bloco de conteúdo`).not.toBeNull();
      expect(title, `${route}: título`).not.toBeNull();
      expect(Math.abs(content!.x - title!.x), `${route}: título alinhado ao conteúdo`).toBeLessThan(
        1.5,
      );
      boxes[route] = { left: content!.x, right: content!.x + content!.width };
      if (!header) {
        // A primeira peça do cabeçalho (busca ou saudação) começa na mesma borda do conteúdo.
        const first = await page
          .locator('[data-cy="workspace-header"] > :first-child')
          .first()
          .boundingBox();
        const last = await page
          .locator('[data-cy="workspace-header"] > :last-child')
          .first()
          .boundingBox();
        header = { left: first!.x, right: last!.x + last!.width };
      }
    }
    const reference = boxes['/']!;
    for (const [route, box] of Object.entries(boxes)) {
      expect(Math.abs(box.left - reference.left), `${route}: borda esquerda`).toBeLessThan(1.5);
      expect(Math.abs(box.right - reference.right), `${route}: borda direita`).toBeLessThan(1.5);
    }
    expect(Math.abs(header!.left - reference.left), 'cabeçalho: borda esquerda').toBeLessThan(1.5);
    expect(Math.abs(header!.right - reference.right), 'cabeçalho: borda direita').toBeLessThan(1.5);
  });
}
