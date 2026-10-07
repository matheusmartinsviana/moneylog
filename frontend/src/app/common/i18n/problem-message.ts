import type { AppI18n } from '~/app/common/i18n/i18n';
import type { Problem } from '~/util/api/problem';

/**
 * Texto de uma falha da API (FE 04): traduzido pelo `code` do contrato, nunca pela mensagem do
 * backend. `code` desconhecido cai numa mensagem genérica pelo status: sem rede, validação (400), regra
 * de negócio não mapeada (422, honesta: a ação foi recusada, os dados precisam de revisão) ou erro.
 */
export function problemMessage(problem: Problem, errors: AppI18n['errors']): string {
  // `code` vem do servidor: `constructor`/`__proto__` não podem devolver um membro herdado do objeto.
  const byCode = Object.hasOwn(errors.codes, problem.code) ? errors.codes[problem.code] : undefined;
  if (byCode) return byCode;
  if (problem.status === 0) return errors.network;
  if (problem.status === 400) return errors.validation;
  if (problem.status === 422) return errors.unprocessable;
  return errors.unavailable;
}
