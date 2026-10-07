import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

import { SessionFacade } from '~/modules/auth/core/facades/session.facade';

/**
 * `canMatch` da área logada (FE 06): sem sessão, a rota nem casa e o usuário vai para
 * `/login?returnUrl=<destino>`, sem renderizar nada protegido. Com o servidor inalcançável no boot
 * (`unreachable`, S-93) o shell abre normalmente: as páginas mostram o erro com "tentar de novo".
 */
export const authGuard: CanMatchFn = () => {
  const session = inject(SessionFacade);
  const router = inject(Router);
  const status = session.status();
  if (status === 'authenticated' || status === 'unreachable') return true;
  const target = router.getCurrentNavigation()?.extractedUrl.toString() ?? '/';
  return router.createUrlTree(['/login'], {
    queryParams: target === '/' ? {} : { returnUrl: target },
  });
};

/** Quem já tem sessão não vê o login: vai para o início. */
export const guestGuard: CanMatchFn = () => {
  const session = inject(SessionFacade);
  return session.authenticated() ? inject(Router).createUrlTree(['/']) : true;
};
