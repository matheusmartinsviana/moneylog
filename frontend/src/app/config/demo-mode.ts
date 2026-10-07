import type { EnvironmentProviders, Provider } from '@angular/core';

/**
 * Providers do modo demonstração. Aqui vazio: o build `demo` (`npm run start:demo`) troca este arquivo por
 * `demo-mode.demo.ts` (`fileReplacements`), que liga o backend de exemplo. A produção não o conhece.
 */
export function provideDemoMode(): (Provider | EnvironmentProviders)[] {
  return [];
}
