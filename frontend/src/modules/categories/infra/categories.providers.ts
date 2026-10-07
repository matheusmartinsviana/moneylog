import { Provider } from '@angular/core';

import { CategoriesGateway } from '~/modules/categories/core/interfaces/categories.gateway';
import { CategoriesRequestsFacade } from '~/modules/categories/infra/facades/categories-requests.facade';

/** Liga a porta do core à implementação da infra. Só o bootstrap (`app.config.ts`) chama isto (S-31). */
export function provideCategories(): Provider[] {
  return [{ provide: CategoriesGateway, useExisting: CategoriesRequestsFacade }];
}
