import type { EnvironmentProviders, Provider } from '@angular/core';

import { provideDemoMode as provide } from '~/demo/demo-providers';

/** Versão do build `demo` de `demo-mode.ts`: liga o backend de exemplo e a faixa de aviso. */
export function provideDemoMode(): (Provider | EnvironmentProviders)[] {
  return provide();
}
