import { Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl } from '@angular/forms';
import { map } from 'rxjs';

/**
 * `form.dirty` como signal (o `FormGroup` não é reativo para o OnPush). Chamar em contexto de injeção.
 * `setValue` programático (carregar a entidade) não suja o formulário; só a digitação do usuário.
 */
export function dirtySignal(form: AbstractControl): Signal<boolean> {
  return toSignal(form.events.pipe(map(() => form.dirty)), { initialValue: false });
}
