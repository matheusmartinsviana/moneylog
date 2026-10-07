import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';

import { ThemeService } from '~/app/common/services/theme.service';

/** Aplica o tema salvo antes do primeiro render. */
export function provideTheme(): EnvironmentProviders {
  return makeEnvironmentProviders([provideAppInitializer(() => inject(ThemeService).init())]);
}
