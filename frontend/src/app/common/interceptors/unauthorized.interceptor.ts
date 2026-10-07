import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { SessionFacade } from '~/modules/auth/core/facades/session.facade';
import { AuthFailure } from '~/modules/auth/core/types/auth-failure';
import { isApiRequest, isAuthRequest } from '~/util/api/api-paths';

/** Marca a requisição que já foi repetida uma vez depois do refresh: se voltar 401, não repete de novo. */
export const RETRIED_AFTER_REFRESH = new HttpContextToken<boolean>(() => false);

/**
 * 401 em `/v1` (T33 CA4): renova o token com **um** refresh compartilhado e repete a requisição
 * **uma** vez. Se o refresh for recusado (`401`), limpa a sessão e vai para
 * `/login?returnUrl=<rota atual>`. Falha de rede ou 5xx no refresh não derruba a sessão: a
 * requisição original falha com o erro original (a tela oferece "tentar de novo").
 *
 * Fica **antes** do `authInterceptor` na lista, para a repetição passar de novo por ele e levar o
 * token novo. `/v1/auth/*` nunca entra aqui: o 401 do login é "senha errada" e o do refresh já é o
 * fim da sessão (revisão A9).
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req.url) || isAuthRequest(req.url)) return next(req);

  const session = inject(SessionFacade);
  const router = inject(Router);
  const usedToken = session.token();

  return next(req).pipe(
    catchError((error: unknown) => {
      const unauthorized = error instanceof HttpErrorResponse && error.status === 401;
      if (!unauthorized || req.context.get(RETRIED_AFTER_REFRESH)) {
        return throwError(() => error);
      }
      return session.refreshAfterUnauthorized(usedToken).pipe(
        switchMap(() => next(req.clone({ context: req.context.set(RETRIED_AFTER_REFRESH, true) }))),
        catchError((failure: unknown) => {
          if (failure instanceof AuthFailure) {
            if (failure.reason === 'refresh_invalid' && session.status() !== 'anonymous') {
              const returnUrl = router.url;
              session.clear();
              void router.navigate(['/login'], {
                queryParams:
                  returnUrl === '/' || returnUrl.startsWith('/login') ? {} : { returnUrl },
              });
            }
            return throwError(() => error);
          }
          return throwError(() => failure);
        }),
      );
    }),
  );
};
