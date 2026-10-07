import { Pipe, PipeTransform } from '@angular/core';

import { formatMoney, Money } from '~/util/money';

/**
 * Formata um `Money` da API pela moeda do dado (FE 04). Só formata: não soma, não arredonda
 * e não converte para `number`. Use dentro de um elemento com `.num` (ou `<app-money>`) para
 * ter números tabulares.
 */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: Money | null | undefined): string {
    return value ? formatMoney(value) : '';
  }
}
