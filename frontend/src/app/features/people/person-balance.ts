import type { AppI18n } from '~/app/common/i18n/i18n';
import { interpolate } from '~/app/common/i18n/interpolate';
import type { Person } from '~/modules/people/core/types/person';
import { formatMoney, withoutSign } from '~/util/money';

/**
 * A frase do saldo com a pessoa ("João deve R$ 150,00", "Você deve R$ 80,00 a João"). Quem escolhe a
 * frase é o `direction` que o backend devolveu e o valor é o `net` dele, só sem o sinal (o sentido já
 * está no texto): o front não calcula nem compara valores (S-142).
 */
export function balanceText(
  person: Pick<Person, 'name' | 'net' | 'direction'>,
  copy: AppI18n['people'],
): string {
  return interpolate(copy.balance[person.direction], {
    name: person.name,
    amount: formatMoney(withoutSign(person.net)),
  });
}

/** "2 dívidas em aberto" / "1 dívida em aberto" / "Nenhuma dívida em aberto". */
export function openDebtsText(count: number, copy: AppI18n['people']): string {
  if (count === 0) return copy.noOpenDebts;
  return interpolate(count === 1 ? copy.openDebtsOne : copy.openDebtsMany, {
    count: String(count),
  });
}
