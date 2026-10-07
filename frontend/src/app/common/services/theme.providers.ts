import { DOCUMENT } from '@angular/common';
import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';

import { applyGlassMode } from '~/app/common/services/glass-support';
import { ThemeService } from '~/app/common/services/theme.service';

/** Aplica o tema salvo e o modo do vidro (`data-glass`) antes do primeiro render. */
export function provideTheme(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      applyGlassMode(inject(DOCUMENT));
      inject(ThemeService).init();
    }),
  ]);
}
