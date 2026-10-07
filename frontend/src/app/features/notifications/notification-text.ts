import type { AppI18n } from '~/app/common/i18n/i18n';
import { interpolate } from '~/app/common/i18n/interpolate';
import type {
  AppNotification,
  DailyMessage,
} from '~/modules/notifications/core/types/notification';
import { formatCompetence, formatIsoDate } from '~/util/date';
import { formatMoney } from '~/util/money';
import { formatRatio } from '~/util/ratio';

type Copy = AppI18n['notifications'];

export interface NotificationText {
  readonly title: string;
  readonly body: string;
}

/** O backend manda decimais sem moeda; os dados do MVP são todos em BRL (a moeda é a do dado). */
const DATA_CURRENCY = 'BRL';
const MONEY_PARAMS = new Set(['amount', 'total', 'available', 'committed7d']);
const DATE_PARAMS = new Set(['dueDate', 'deadline']);
const RATIO_PARAMS = new Set(['progress', 'goalProgress']);
const PLACEHOLDER = /\{\w+\}/;

/** Formata cada parâmetro pelo seu tipo (dinheiro, data, razão); o restante segue como veio. */
function formatParams(
  params: Readonly<Record<string, string>>,
  locale: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (MONEY_PARAMS.has(key)) out[key] = formatMoney({ amount: value, currency: DATA_CURRENCY });
    else if (DATE_PARAMS.has(key)) out[key] = formatIsoDate(value, locale);
    else if (key === 'month') out[key] = formatCompetence(value, locale);
    else if (RATIO_PARAMS.has(key)) out[key] = formatRatio(value, locale);
    else out[key] = value;
  }
  return out;
}

/**
 * Texto da mensagem diária: "Bom dia, {nome}. Hoje você tem R$ X disponíveis e R$ Y em compromissos nos
 * próximos 7 dias." (+ a meta, se houver). Faltou `available` ou `committed7d`? Só a saudação ("Bom dia."):
 * nunca `undefined` nem `{chave}` na tela. O backend não monta a frase; só os números vêm dele.
 */
export function dailyMessageText(
  params: Readonly<Record<string, string>>,
  copy: Copy,
  locale: string,
): string {
  const formatted = formatParams(params, locale);
  const name = formatted['name']?.trim();
  const greeting = name ? interpolate(copy.daily.greetingNamed, { name }) : copy.daily.greeting;
  const parts = [greeting];
  if (formatted['available'] !== undefined && formatted['committed7d'] !== undefined) {
    parts.push(interpolate(copy.daily.summary, formatted));
    if (formatted['goalName'] && formatted['goalProgress']) {
      parts.push(interpolate(copy.daily.goal, formatted));
    }
  }
  return parts.join(' ');
}

/**
 * Título e corpo de uma notificação a partir da chave de i18n e dos `params` (o backend não grava frase
 * pronta, S-34). Chave desconhecida, ou parâmetro que falta, mostra o texto neutro: nunca a chave crua.
 */
export function notificationText(
  notification: Pick<AppNotification, 'titleKey' | 'params'>,
  copy: Copy,
  locale: string,
): NotificationText {
  const entry = Object.hasOwn(copy.messages, notification.titleKey)
    ? copy.messages[notification.titleKey]
    : undefined;
  if (!entry) return copy.unknownMessage;
  const params =
    notification.titleKey === 'daily.summary'
      ? { text: dailyMessageText(notification.params, copy, locale) }
      : formatParams(notification.params, locale);
  const title = interpolate(entry.title, params);
  const body = interpolate(entry.body, params);
  return PLACEHOLDER.test(title) || PLACEHOLDER.test(body) ? copy.unknownMessage : { title, body };
}

/** Texto da mensagem do dia para o Início. */
export function dailyText(message: DailyMessage, copy: Copy, locale: string): string {
  return dailyMessageText(message.params, copy, locale);
}

/** Para onde a notificação leva (a entidade citada). */
export function notificationLink(notification: Pick<AppNotification, 'ref'>): string {
  const { type, id } = notification.ref;
  switch (type) {
    case 'CARD':
      return `/cards/${encodeURIComponent(id)}`;
    case 'DEBT':
      return `/debts/${encodeURIComponent(id)}`;
    case 'GOAL':
      return `/goals/${encodeURIComponent(id)}`;
    case 'RECURRENCE':
      return '/planning';
    case 'REMINDER':
      return '/notifications';
    default:
      return '/';
  }
}
