import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { MoneyComponent } from '~/app/common/components/money/money.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import type {
  CommittedHorizons,
  ProjectedHorizons,
} from '~/modules/dashboard/core/types/dashboard-summary';
import type { Money } from '~/util/money';

type Horizon = keyof CommittedHorizons;

const HORIZONS: readonly Horizon[] = ['d7', 'd30', 'd60', 'd90', 'm6', 'm12'];

interface HorizonRow {
  readonly key: Horizon;
  readonly committed: Money;
  /** O contrato não traz projeção para 7 e 60 dias. */
  readonly projected: Money | null;
}

/**
 * "O que está comprometido": tabela de horizontes (linhas) × comprometido e projetado (colunas),
 * no estilo planilha. Cabe no mobile sem rolagem horizontal. Os valores são os recebidos.
 */
@Component({
  selector: 'app-commitments',
  imports: [MoneyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table class="horizons" data-cy="home-commitments">
      <thead>
        <tr>
          <td></td>
          <th scope="col">{{ t().home.committed.committedRow }}</th>
          <th scope="col">{{ t().home.committed.projectedRow }}</th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.key) {
          <tr>
            <th scope="row">{{ t().home.committed.horizons[row.key] }}</th>
            <td [attr.data-cy]="'home-committed-' + row.key">
              <app-money [value]="row.committed" />
            </td>
            <td class="projected" [attr.data-cy]="'home-projected-' + row.key">
              @if (row.projected; as projected) {
                <app-money [value]="projected" />
              } @else {
                <span aria-hidden="true">—</span>
                <span class="visually-hidden">{{ t().home.committed.notApplicable }}</span>
              }
            </td>
          </tr>
        }
      </tbody>
    </table>
    <p class="note">{{ t().home.committed.projectionNote }}</p>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }

    .horizons {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--text-sm);
    }

    th,
    td {
      padding: var(--space-2) 0;
      border-bottom: var(--border-width) solid var(--color-border);
      text-align: right;
    }

    tbody tr:last-child > * {
      border-bottom: 0;
    }

    th[scope='row'] {
      color: var(--color-text-muted);
      font-weight: var(--weight-regular);
      text-align: left;
    }

    th[scope='col'] {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
      padding-left: var(--space-3);
    }

    td {
      padding-left: var(--space-3);
    }

    .projected {
      color: var(--color-text-muted);
    }

    .note {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      text-wrap: pretty;
    }
  `,
})
export class CommitmentsComponent {
  protected readonly t = inject(I18nService).t;

  readonly committed = input.required<CommittedHorizons>();
  readonly projected = input.required<ProjectedHorizons>();

  protected readonly rows = computed<readonly HorizonRow[]>(() => {
    const committed = this.committed();
    const projected: Partial<Record<Horizon, Money>> = this.projected();
    return HORIZONS.map((key) => ({
      key,
      committed: committed[key],
      projected: projected[key] ?? null,
    }));
  });
}
