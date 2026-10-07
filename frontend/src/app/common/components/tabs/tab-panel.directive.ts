import { Directive, inject, input, TemplateRef } from '@angular/core';

/**
 * Painel de uma aba: `<ng-template appTabPanel="resumo">…</ng-template>` dentro de `<app-tabs>`.
 * O `Tabs` monta o conteúdo quando a aba é aberta pela primeira vez (e o mantém depois).
 */
@Directive({ selector: 'ng-template[appTabPanel]' })
export class TabPanelDirective {
  /** `id` da aba a que o painel pertence. */
  readonly id = input.required<string>({ alias: 'appTabPanel' });
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}
