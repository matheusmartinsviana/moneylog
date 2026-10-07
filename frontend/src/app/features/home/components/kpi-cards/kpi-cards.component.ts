import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { GaugeComponent } from '~/app/common/components/charts/gauge.component';
import { MoneyComponent } from '~/app/common/components/money/money.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { DashboardSummary } from '~/modules/dashboard/core/types/dashboard-summary';
import type {
  MonthlySummary,
  SummaryDelta,
} from '~/modules/monthly-summary/core/types/monthly-summary';
import { formatPoints, formatRatio, ratioForBar, ratioMagnitude, ratioSign } from '~/util/ratio';

export type KpiMonthlyStatus = 'loading' | 'error' | 'ready';
type Tone = 'positive' | 'warning' | 'neutral';

/** Chip de variação: o texto vem do backend (só formatado) e o tom nunca é o único sinal (a frase diz o sentido). */
interface Chip {
  readonly text: string;
  readonly tone: Tone;
}

/**
 * Os 4 KPIs do Início (DS 02, T202), com hierarquias diferentes: herói (saldo em contas), métrica com variação
 * (gasto), métrica simples (receita) e anel (taxa de poupança). **Nenhum cálculo no front**: valores, percentuais
 * e variações vêm do backend (`balances.inAccountsChange`, `comparison.*Delta`, `savingsRate`,
 * `savingsRateDelta`) e só são formatados. Com `partial = true` (mês em andamento contra o anterior inteiro) os
 * chips ficam neutros e dizem isso (R5): nada de verde nem de "menor que o mês anterior" no dia 10. Presentational.
 */
@Component({
  selector: 'app-kpi-cards',
  imports: [MoneyComponent, GaugeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="kpis" role="group" [attr.aria-label]="t().dashboard.kpis.label" data-cy="home-kpis">
      <section
        class="kpi kpi--hero"
        aria-labelledby="kpi-in-accounts-title"
        data-cy="kpi-in-accounts"
      >
        <h3 class="kpi__label" id="kpi-in-accounts-title">
          {{ t().dashboard.kpis.inAccounts.title }}
        </h3>
        <p
          class="kpi__value kpi__value--hero"
          [class.is-negative]="negative(summary().balances.inAccounts.amount)"
          data-cy="kpi-in-accounts-value"
        >
          <app-money [value]="summary().balances.inAccounts" />
        </p>
        @if (inAccountsChip(); as chip) {
          <p class="delta" [attr.data-tone]="chip.tone" data-cy="kpi-in-accounts-change">
            {{ chip.text }}
          </p>
        }
      </section>

      <section class="kpi" aria-labelledby="kpi-spending-title" data-cy="kpi-spending">
        <h3 class="kpi__label" id="kpi-spending-title">{{ t().dashboard.kpis.spending.title }}</h3>
        <p class="kpi__value" data-cy="kpi-spending-value">
          <app-money [value]="summary().month.consumption" />
        </p>
        <p class="kpi__caption" data-cy="kpi-spending-caption">{{ caption() }}</p>
        @if (spendingChip(); as chip) {
          <p class="delta" [attr.data-tone]="chip.tone" data-cy="kpi-spending-change">
            {{ chip.text }}
          </p>
        } @else if (monthlyStatus() === 'loading') {
          <p class="delta delta--skeleton" aria-hidden="true"></p>
        }
      </section>

      <section class="kpi" aria-labelledby="kpi-income-title" data-cy="kpi-income">
        <h3 class="kpi__label" id="kpi-income-title">{{ t().dashboard.kpis.income.title }}</h3>
        <p class="kpi__value" data-cy="kpi-income-value">
          <app-money [value]="summary().month.income" />
        </p>
        <p class="kpi__caption">{{ caption() }}</p>
        @if (incomeChip(); as chip) {
          <p class="delta" [attr.data-tone]="chip.tone" data-cy="kpi-income-change">
            {{ chip.text }}
          </p>
        } @else if (monthlyStatus() === 'loading') {
          <p class="delta delta--skeleton" aria-hidden="true"></p>
        }
      </section>

      <section class="kpi kpi--gauge" aria-labelledby="kpi-savings-title" data-cy="kpi-savings">
        <h3 class="kpi__label" id="kpi-savings-title">{{ t().dashboard.kpis.savings.title }}</h3>
        <!-- O arco só desenha a razão do backend (savingsRate); o número está em texto, dentro do medidor. -->
        <app-gauge [share]="ringShare()" data-cy="kpi-savings-ring">
          @switch (monthlyStatus()) {
            @case ('ready') {
              @if (monthly(); as m) {
                <p
                  class="kpi__value kpi__value--gauge"
                  [class.is-negative]="m.savingsRate !== null && negative(m.savingsRate)"
                  data-cy="kpi-savings-value"
                >
                  {{ savingsText() }}
                </p>
              }
            }
            @case ('error') {
              <p class="kpi__value kpi__value--gauge" data-cy="kpi-savings-value">—</p>
            }
            @default {
              <p class="kpi__skeleton" aria-hidden="true"></p>
            }
          }
        </app-gauge>
        <div class="kpi__text kpi__text--center">
          @switch (monthlyStatus()) {
            @case ('ready') {
              @if (monthly(); as m) {
                @if (m.savingsRate === null) {
                  <p class="kpi__caption" data-cy="kpi-savings-empty">
                    {{ t().dashboard.kpis.savings.noIncome }}
                  </p>
                } @else {
                  <p class="kpi__caption">{{ caption() }}</p>
                }
                @if (savingsChip(); as chip) {
                  <p class="delta" [attr.data-tone]="chip.tone" data-cy="kpi-savings-change">
                    {{ chip.text }}
                  </p>
                }
              }
            }
            @case ('error') {
              <p class="kpi__caption" role="status" data-cy="kpi-savings-error">
                {{ t().dashboard.kpis.unavailable }}
              </p>
              <button type="button" class="kpi__retry" data-cy="kpi-retry" (click)="retry.emit()">
                {{ t().dashboard.kpis.retry }}
              </button>
            }
            @default {
              <p class="visually-hidden" role="status">{{ t().dashboard.kpis.loading }}</p>
            }
          }
        </div>
      </section>
    </div>
  `,
  styleUrl: './kpi-cards.component.css',
})
export class KpiCardsComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly summary = input.required<DashboardSummary>();
  /** `null` enquanto não chegou ou se falhou (veja `monthlyStatus`). */
  readonly monthly = input<MonthlySummary | null>(null);
  readonly monthlyStatus = input<KpiMonthlyStatus>('loading');
  readonly retry = output<void>();

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);

  /** `true` quando o mês em andamento é comparado com o anterior inteiro (R5). */
  private readonly partial = computed(() => this.monthly()?.partial ?? false);

  protected readonly caption = computed(() => {
    const copy = this.t().dashboard.kpis;
    if (this.summary().isProjection || this.monthly()?.isProjection) return copy.projection;
    return this.partial() ? copy.thisMonthPartial : copy.thisMonth;
  });

  protected negative(amount: string): boolean {
    return amount.startsWith('-');
  }

  protected readonly inAccountsChip = computed<Chip | null>(() => {
    const change = this.summary().balances.inAccountsChange;
    const copy = this.t().dashboard.kpis.delta;
    if (change === null) return null;
    if (change.percent === null) return { text: copy.noBase, tone: 'neutral' };
    const sign = ratioSign(change.percent);
    return {
      text: interpolate(copy.since, {
        value: formatRatio(change.percent, this.locale(), { signed: true }),
      }),
      tone: sign === 'up' ? 'positive' : sign === 'down' ? 'warning' : 'neutral',
    };
  });

  protected readonly spendingChip = computed(() =>
    this.relativeChip(this.comparison()?.expensesDelta, 'down'),
  );
  protected readonly incomeChip = computed(() =>
    this.relativeChip(this.comparison()?.incomeDelta, 'up'),
  );

  private readonly comparison = computed(() => this.monthly()?.comparison ?? null);

  protected readonly savingsText = computed(() => {
    const rate = this.monthly()?.savingsRate ?? null;
    return rate === null ? '—' : formatRatio(rate, this.locale());
  });

  protected readonly savingsChip = computed<Chip | null>(() => {
    const delta = this.comparison()?.savingsRateDelta ?? null;
    if (delta === null) return null;
    const copy = this.t().dashboard.kpis.delta;
    const value = formatPoints(delta, this.locale(), { signed: true });
    if (this.partial())
      return { text: interpolate(copy.pointsPartial, { value }), tone: 'neutral' };
    const sign = ratioSign(delta);
    return {
      text: interpolate(copy.points, { value }),
      tone: sign === 'up' ? 'positive' : sign === 'down' ? 'warning' : 'neutral',
    };
  });

  /** Posição do arco (0 a 100): a taxa do backend, só para desenhar; taxa negativa ou ausente não desenha. */
  protected readonly ringShare = computed(() => {
    const rate = this.monthly()?.savingsRate ?? null;
    const bar = rate === null ? null : ratioForBar(rate);
    if (bar === null || bar <= 0) return null;
    return Math.round(Math.min(1, bar) * 1000) / 10;
  });

  /**
   * Chip de uma variação `comparison.*Delta` do backend. `better` diz em que sentido a variação é boa (gastar menos,
   * receber mais). Com o mês em andamento o chip é neutro e mostra o valor com o rótulo do que está sendo comparado.
   */
  private relativeChip(delta: SummaryDelta | undefined, better: 'up' | 'down'): Chip | null {
    if (!delta) return null;
    const copy = this.t().dashboard.kpis.delta;
    if (delta.percent === null) return { text: copy.noBase, tone: 'neutral' };
    if (this.partial()) {
      const value = formatRatio(delta.percent, this.locale(), { signed: true });
      return { text: interpolate(copy.partial, { value }), tone: 'neutral' };
    }
    const sign = ratioSign(delta.percent);
    if (sign === 'flat') return { text: copy.same, tone: 'neutral' };
    const value = formatRatio(ratioMagnitude(delta.percent), this.locale());
    return {
      text: interpolate(sign === 'up' ? copy.higher : copy.lower, { value }),
      tone: sign === better ? 'positive' : 'warning',
    };
  }
}
