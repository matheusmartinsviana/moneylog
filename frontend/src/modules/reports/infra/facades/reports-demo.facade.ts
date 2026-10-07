import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

import { ReportsGateway } from '~/modules/reports/core/interfaces/reports.gateway';
import type {
  IncomeExpenseSeries,
  ReportPeriod,
  SpendingByCategory,
} from '~/modules/reports/core/types/reports';
import { demoIncomeExpenseSeries } from '~/modules/reports/mock-data/income-expenses.fixture';
import { demoSpendingByCategory } from '~/modules/reports/mock-data/spending-by-category.fixture';

/** Implementação de **demonstração** da porta: devolve fixtures fiéis ao contrato futuro, sem HTTP. */
@Injectable()
export class ReportsDemoFacade extends ReportsGateway {
  readonly isDemo = true;

  incomeExpenses(period: ReportPeriod): Observable<IncomeExpenseSeries> {
    return of(demoIncomeExpenseSeries(period));
  }

  spendingByCategory(month: string, limit = 5): Observable<SpendingByCategory> {
    return of(demoSpendingByCategory(month, limit));
  }
}
