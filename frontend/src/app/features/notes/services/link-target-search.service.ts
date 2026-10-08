import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { goalName } from '~/app/features/goals/services/goal-name';
import { CardsGateway } from '~/modules/cards/core/interfaces/cards.gateway';
import { DebtsGateway } from '~/modules/debts/core/interfaces/debts.gateway';
import { GoalsGateway } from '~/modules/goals/core/interfaces/goals.gateway';
import { PeopleGateway } from '~/modules/people/core/interfaces/people.gateway';
import { TransactionsGateway } from '~/modules/transactions/core/interfaces/transactions.gateway';
import { defaultFilters } from '~/modules/transactions/core/types/list-filters';
import { MAX_PAGE_SIZE } from '~/util/api/slice';
import { formatCompetence, formatIsoDate } from '~/util/date';
import { counterpartyName } from '~/util/debt-name';
import { formatMoney } from '~/util/money';

/** Um registro que o seletor oferece para vincular (rótulo e dica já legíveis). */
export interface LinkCandidate {
  readonly type: 'TRANSACTION' | 'GOAL' | 'PERSON' | 'DEBT' | 'CARD' | 'INVOICE';
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
}

const RESULT_LIMIT = 10;

const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Busca os registros que uma nota pode vincular, **através das portas de cada módulo** (a página injeta; os
 * módulos continuam sem importar uns aos outros). Só lê: nada daqui grava nem calcula valor. O que é filtrado
 * "por nome" é o que o backend ainda não filtra (metas, dívidas, cartões): lista curta, filtro no cliente.
 * Escopo de componente.
 */
@Injectable()
export class LinkTargetSearchService {
  private readonly i18n = inject(I18nService);
  private readonly transactions = inject(TransactionsGateway);
  private readonly people = inject(PeopleGateway);
  private readonly goals = inject(GoalsGateway);
  private readonly debts = inject(DebtsGateway);
  private readonly cards = inject(CardsGateway);

  private get locale(): string {
    return HTML_LANG[this.i18n.language()];
  }

  search(type: LinkCandidate['type'], term: string): Observable<readonly LinkCandidate[]> {
    const q = term.trim();
    switch (type) {
      case 'TRANSACTION':
        return this.transactions
          .list(
            // Sem período (o relógio do aparelho não decide nada): só a busca por texto, entre as ativas.
            { ...defaultFilters('2026-01-01'), from: null, to: null, q },
            1,
            RESULT_LIMIT,
          )
          .pipe(
            map((slice) =>
              slice.items.map((item) => ({
                type: 'TRANSACTION' as const,
                id: item.id,
                label: item.description,
                hint: `${formatIsoDate(item.date, this.locale)} · ${formatMoney(item.amount)}`,
              })),
            ),
          );
      case 'PERSON':
        return this.people
          .list({ status: 'ACTIVE', ...(q ? { q } : {}), page: 1, pageSize: RESULT_LIMIT })
          .pipe(
            map((slice) =>
              slice.items.map((item) => ({
                type: 'PERSON' as const,
                id: item.id,
                label: item.name,
              })),
            ),
          );
      case 'GOAL':
        return this.goals.list({ page: 1, pageSize: MAX_PAGE_SIZE }).pipe(
          map((slice) =>
            slice.items
              .map((item) => ({
                type: 'GOAL' as const,
                id: item.id,
                label: goalName(item, this.i18n.t().goals),
              }))
              .filter((item) => fold(item.label).includes(fold(q)))
              .slice(0, RESULT_LIMIT),
          ),
        );
      case 'DEBT':
        return this.debts.list({ page: 1, pageSize: MAX_PAGE_SIZE }).pipe(
          map((slice) =>
            slice.items
              .filter((item) =>
                fold(`${counterpartyName(item)} ${item.description ?? ''}`).includes(fold(q)),
              )
              .slice(0, RESULT_LIMIT)
              .map((item) => ({
                type: 'DEBT' as const,
                id: item.id,
                label: item.description
                  ? `${counterpartyName(item)} · ${item.description}`
                  : counterpartyName(item),
                hint: formatMoney(item.outstanding),
              })),
          ),
        );
      case 'CARD':
      case 'INVOICE':
        return this.cardOptions(q, type);
      default:
        return this.cardOptions(q, 'CARD');
    }
  }

  /** Cartões ativos (para vincular o cartão ou para escolher de qual cartão é a fatura). */
  cardOptions(
    term: string,
    type: 'CARD' | 'INVOICE' = 'CARD',
  ): Observable<readonly LinkCandidate[]> {
    return this.cards.list({ status: 'ACTIVE', page: 1, pageSize: MAX_PAGE_SIZE }).pipe(
      map((slice) =>
        slice.items
          .filter((item) => fold(item.name).includes(fold(term)))
          .slice(0, RESULT_LIMIT * 2)
          .map((item) => ({
            type: type as 'CARD',
            id: item.id,
            label: item.name,
            ...(item.institution ? { hint: item.institution } : {}),
          })),
      ),
    );
  }

  /** Faturas de um cartão, as mais recentes primeiro. */
  invoices(cardId: string): Observable<readonly LinkCandidate[]> {
    return this.cards.listInvoices(cardId, { page: 1, pageSize: 24 }).pipe(
      map((slice) =>
        [...slice.items]
          .sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth))
          .map((item) => ({
            type: 'INVOICE' as const,
            id: item.id,
            label: interpolate(this.i18n.t().notes.picker.invoiceLabel, {
              month: formatCompetence(item.referenceMonth, this.locale),
            }),
            hint: formatIsoDate(item.dueDate, this.locale),
          })),
      ),
    );
  }
}
