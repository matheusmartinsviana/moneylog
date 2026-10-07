import axe from 'axe-core';

/**
 * Roda o axe no elemento e devolve as violações. `color-contrast` fica de fora porque o jsdom
 * não calcula layout nem cores (o contraste é verificado por `npm run contrast`).
 */
export async function axeViolations(element: Element): Promise<axe.Result[]> {
  const result = await axe.run(element, {
    rules: {
      'color-contrast': { enabled: false },
      // Componentes isolados não estão dentro de landmarks da página inteira.
      region: { enabled: false },
    },
  });
  return result.violations;
}

/** Formata as violações para a mensagem do teste. */
export function describeViolations(violations: axe.Result[]): string {
  return violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`).join('\n');
}
