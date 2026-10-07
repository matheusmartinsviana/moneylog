import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';

/** Gancho de melhor esforço rodado no "Sair", antes do logout (o token ainda vale). Erros são ignorados. */
export type SessionEndHook = () => Observable<unknown>;

export const SESSION_END_HOOKS = new InjectionToken<readonly SessionEndHook[]>('SESSION_END_HOOKS');
