import { registerLocaleData } from '@angular/common';
import localeEn from '@angular/common/locales/en';
import localePt from '@angular/common/locales/pt';
import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';

import { I18nService } from '~/app/common/i18n/i18n.service';

/**
 * Locales de formatação registrados independentemente do idioma da UI (FE 04):
 * evita `NG0701: Missing locale data` ao formatar dados em pt-BR com a UI em inglês.
 */
export function registerMoneyLocales(): void {
  registerLocaleData(localePt, 'pt');
  registerLocaleData(localeEn, 'en');
}

/** Registra os locales e carrega o idioma ativo antes do primeiro render. */
export function provideI18n(): EnvironmentProviders {
  registerMoneyLocales();
  return makeEnvironmentProviders([provideAppInitializer(() => inject(I18nService).init())]);
}
