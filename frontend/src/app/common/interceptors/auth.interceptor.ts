import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { SessionFacade } from '~/modules/auth/core/facades/session.facade';
import { isApiRequest, isAuthRequest } from '~/util/api/api-paths';

/**
 * Anexa `Authorization: Bearer` só nas chamadas a `/v1` (exceto `/v1/auth/*`, que são públicas).
 * Outra origem e `/assets` saem sem o header (FE 06, T33 CA3). O token vem da memória da sessão.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req.url) || isAuthRequest(req.url)) return next(req);
  const token = inject(SessionFacade).token();
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};
