import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlSegment, UrlSegmentGroup, UrlTree } from '@angular/router';

/**
 * `/quick-add?...` (botões, atalhos, deep link) abre o Novo registro como modal: o guard troca a URL por
 * `<tela de origem>(modal:quick-add)?...`, mantendo a tela de origem atrás. Sem origem (link direto,
 * primeira navegação), o modal abre sobre o Início. Os parâmetros (`mode`, `amount`, `cardId`...) seguem.
 */
export const quickAddModalGuard: CanActivateFn = (route) => {
  // Na rota auxiliar (ou em filhas dela) é o próprio modal: segue.
  if (route.pathFromRoot.some((r) => r.outlet === 'modal')) return true;
  const router = inject(Router);
  const navigation = router.getCurrentNavigation();
  const previous = navigation?.previousNavigation?.finalUrl;
  const origin = previous
    ? router.parseUrl(previous.toString()).root.children['primary']
    : undefined;
  const modal = new UrlSegmentGroup([new UrlSegment('quick-add', {})], {});
  const root = new UrlSegmentGroup([], origin ? { primary: origin, modal } : { modal });
  return new UrlTree(root, navigation?.extractedUrl.queryParams ?? {}, null);
};
