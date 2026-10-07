import type { AbstractControl, ValidationErrors } from '@angular/forms';

/** Texto obrigatório que não aceita só espaços. */
export function requiredTrimmed(control: AbstractControl<string | null>): ValidationErrors | null {
  return (control.value ?? '').trim() === '' ? { required: true } : null;
}
