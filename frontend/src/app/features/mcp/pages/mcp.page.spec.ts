import { render, screen } from '@testing-library/angular';

import { pt } from '~/app/common/i18n/translations/pt';
import { McpPage } from '~/app/features/mcp/pages/mcp.page';
import { axeViolations, describeViolations } from '~/testing/axe';
import { provideI18nTesting } from '~/testing/i18n-testing';

describe('McpPage ("em breve")', () => {
  it('Dado que não existe MCP, então lista as 5 ferramentas como "Planejado" e nada é interativo', async () => {
    const { container } = await render(McpPage, { providers: [provideI18nTesting('pt')] });

    expect(screen.getByTestId('mcp-soon')).toHaveTextContent(pt.workspacePages.mcp.soon);
    expect(screen.getByTestId('mcp-tools').querySelectorAll('li')).toHaveLength(5);
    expect(screen.getAllByText(pt.workspacePages.mcp.planned)).toHaveLength(5);
    expect(container.querySelector('button, a, input, [role="switch"]')).toBeNull();
    expect(container.textContent).not.toMatch(/conectado/i);
    const violations = await axeViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
