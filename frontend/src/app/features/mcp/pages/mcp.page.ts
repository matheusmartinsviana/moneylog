import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { I18nService } from '~/app/common/i18n/i18n.service';

/**
 * `/mcp` (T223): "Em breve". Não existe servidor MCP. A página lista as ferramentas previstas como
 * **"Planejado"** e diz como a escrita funcionará (só pendências a confirmar). Sem toggle, sem status
 * "conectado", sem chave nem URL: nada clicável finge funcionar.
 */
@Component({
  selector: 'app-mcp-page',
  imports: [PageLayoutComponent, SectionContainerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-layout [heading]="t().nav.mcp" [description]="t().workspacePages.mcp.subtitle">
      <div class="mcp" data-cy="mcp-page">
        <div class="mcp__soon" aria-disabled="true" data-cy="mcp-soon">
          <span class="mcp__badge">{{ t().workspacePages.mcp.soon }}</span>
          <p>{{ t().workspacePages.mcp.description }}</p>
        </div>

        <app-section-container [heading]="t().workspacePages.mcp.toolsTitle">
          <ul class="mcp__tools" data-cy="mcp-tools">
            @for (tool of tools(); track tool.key) {
              <li class="mcp__tool" [attr.data-cy]="'mcp-tool-' + tool.key">
                <span>{{ tool.label }}</span>
                <span class="mcp__planned">{{ t().workspacePages.mcp.planned }}</span>
              </li>
            }
          </ul>
        </app-section-container>

        <app-section-container [heading]="t().workspacePages.mcp.accessTitle">
          <p class="mcp__muted" data-cy="mcp-access">{{ t().workspacePages.mcp.accessText }}</p>
        </app-section-container>
      </div>
    </app-page-layout>
  `,
  styles: `
    .mcp {
      display: grid;
      gap: var(--space-5);
      max-width: 44rem;
    }

    .mcp__soon {
      display: grid;
      justify-items: start;
      gap: var(--space-2);
      padding: var(--space-4);
      border-radius: var(--radius-card);
      background-color: var(--color-surface-muted);
      color: var(--color-text-muted);
    }

    .mcp__badge {
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
    }

    .mcp__tools {
      display: grid;
      gap: var(--space-2);
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .mcp__tool {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-control);
    }

    .mcp__planned,
    .mcp__muted {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }
  `,
})
export class McpPage {
  protected readonly t = inject(I18nService).t;
  protected readonly tools = computed(() => {
    const copy = this.t().workspacePages.mcp.tools;
    return [
      { key: 'read-transactions', label: copy.readTransactions },
      { key: 'analyze-spending', label: copy.analyzeSpending },
      { key: 'generate-reports', label: copy.generateReports },
      { key: 'create-pending', label: copy.createPending },
      { key: 'generate-notes', label: copy.generateNotes },
    ];
  });
}
