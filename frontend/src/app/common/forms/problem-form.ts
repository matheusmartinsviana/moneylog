import { AbstractControl, FormGroup } from '@angular/forms';

import type { Problem } from '~/util/api/problem';

/**
 * Leva a falha do backend para os campos do formulário (FE 02), sem perder o que foi digitado:
 * - `errors[]` de um `VALIDATION_FAILED`: o campo (`amount`, `openingBalance.amount`...) recebe o
 *   `code` do erro;
 * - um `code` de regra de negócio mapeado em `codeToField` (ex.: `REFUND_EXCEEDS_ORIGINAL` → `amount`)
 *   vai para o campo indicado.
 *
 * O erro vai como `{ server: <code> }` e o `FieldError` o traduz pelo `code`. Ele some quando o
 * usuário edita o campo (a validação do controle roda de novo). Devolve se algum campo recebeu erro;
 * se não, a tela mostra a mensagem do `code` num aviso geral.
 */
export function applyProblemToForm(
  form: FormGroup,
  problem: Problem,
  codeToField: Readonly<Record<string, string>> = {},
): boolean {
  let applied = false;
  const mark = (control: AbstractControl | null, code: string) => {
    if (!control) return;
    control.setErrors({ server: code });
    control.markAsTouched();
    applied = true;
  };
  for (const fieldError of problem.fieldErrors) {
    const path = fieldError.field.split('.')[0] ?? '';
    mark(form.get(path), fieldError.code);
  }
  const field = codeToField[problem.code];
  if (field) mark(form.get(field), problem.code);
  return applied;
}
