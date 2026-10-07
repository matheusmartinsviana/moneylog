/*
 * Service worker do moneylog: o do Angular (`ngsw-worker.js`) mais os handlers de push e de clique na
 * notificação (Etapa 7, T137). Push é preparado e só chega com chaves VAPID no servidor.
 *
 * O payload (`{ id, kind, titleKey, params }`) NÃO traz frase pronta: o título e o corpo saem daqui pelo
 * `kind`, no idioma guardado (o app avisa o idioma por `postMessage({ type: 'LANGUAGE' })`, que fica no Cache
 * Storage porque o worker não lê `localStorage`). Payload malformado é ignorado sem erro.
 */
importScripts('./ngsw-worker.js');

const PREFS_CACHE = 'moneylog-prefs';
const PREFS_KEY = '/__language';
const DEFAULT_LANGUAGE = 'pt';
const NOTIFICATIONS_URL = '/notifications';

const TEXTS = {
  pt: {
    INVOICE_DUE: ['Fatura de cartão', 'Há uma fatura perto do vencimento.'],
    DEBT_COLLECT: ['Dívida a receber', 'Há um recebimento previsto.'],
    DEBT_PAYABLE_DUE: ['Dívida a pagar', 'Há uma dívida perto do vencimento.'],
    RECURRENCE_PENDING: ['Recorrência pendente', 'Há uma recorrência para confirmar.'],
    COMMITTED_NEXT_MONTH: ['Próximo mês', 'Veja seus compromissos do próximo mês.'],
    DAILY_SUMMARY: ['Resumo do dia', 'Abra para ver o resumo do dia.'],
    REMINDER: ['Lembrete', 'Você tem um lembrete.'],
    GOAL_DEADLINE: ['Meta com prazo', 'Uma meta está perto do prazo.'],
    GROUPED: ['Mais avisos', 'Abra para ver todos os avisos.'],
    DEFAULT: ['Nova notificação', 'Abra para ver os detalhes.'],
  },
  en: {
    INVOICE_DUE: ['Card invoice', 'An invoice is close to its due date.'],
    DEBT_COLLECT: ['Debt to collect', 'A payment is expected.'],
    DEBT_PAYABLE_DUE: ['Debt to pay', 'A debt is close to its due date.'],
    RECURRENCE_PENDING: ['Pending recurrence', 'A recurrence needs confirming.'],
    COMMITTED_NEXT_MONTH: ['Next month', 'See your commitments for next month.'],
    DAILY_SUMMARY: ['Daily summary', 'Open to see the daily summary.'],
    REMINDER: ['Reminder', 'You have a reminder.'],
    GOAL_DEADLINE: ['Goal deadline', 'A goal is close to its deadline.'],
    GROUPED: ['More alerts', 'Open to see all alerts.'],
    DEFAULT: ['New notification', 'Open it to see the details.'],
  },
  es: {
    INVOICE_DUE: ['Factura de tarjeta', 'Hay una factura cerca del vencimiento.'],
    DEBT_COLLECT: ['Deuda por cobrar', 'Hay un cobro previsto.'],
    DEBT_PAYABLE_DUE: ['Deuda por pagar', 'Hay una deuda cerca del vencimiento.'],
    RECURRENCE_PENDING: ['Recurrencia pendiente', 'Hay una recurrencia por confirmar.'],
    COMMITTED_NEXT_MONTH: ['Próximo mes', 'Mira tus compromisos del próximo mes.'],
    DAILY_SUMMARY: ['Resumen del día', 'Ábrelo para ver el resumen del día.'],
    REMINDER: ['Recordatorio', 'Tienes un recordatorio.'],
    GOAL_DEADLINE: ['Meta con plazo', 'Una meta está cerca del plazo.'],
    GROUPED: ['Más avisos', 'Ábrelo para ver todos los avisos.'],
    DEFAULT: ['Notificación nueva', 'Ábrela para ver los detalles.'],
  },
};

/** Payload válido: objeto com `kind` texto. Qualquer outra coisa é ignorada. */
function parsePayload(event) {
  if (!event.data) return null;
  try {
    const payload = event.data.json();
    return payload && typeof payload === 'object' && typeof payload.kind === 'string'
      ? payload
      : null;
  } catch {
    return null;
  }
}

async function storedLanguage() {
  try {
    const cache = await caches.open(PREFS_CACHE);
    const response = await cache.match(PREFS_KEY);
    const value = response ? await response.text() : DEFAULT_LANGUAGE;
    return Object.prototype.hasOwnProperty.call(TEXTS, value) ? value : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'LANGUAGE' || typeof data.language !== 'string') return;
  if (!Object.prototype.hasOwnProperty.call(TEXTS, data.language)) return;
  event.waitUntil(
    caches
      .open(PREFS_CACHE)
      .then((cache) => cache.put(PREFS_KEY, new Response(data.language)))
      .catch(() => undefined),
  );
});

self.addEventListener('push', (event) => {
  const payload = parsePayload(event);
  if (!payload) return;
  event.waitUntil(
    storedLanguage().then((language) => {
      const table = TEXTS[language];
      const [title, body] = Object.prototype.hasOwnProperty.call(table, payload.kind)
        ? table[payload.kind]
        : table.DEFAULT;
      return self.registration.showNotification(title, {
        body,
        tag: typeof payload.id === 'string' ? payload.id : undefined,
        data: { url: NOTIFICATIONS_URL },
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  const url = event.notification && event.notification.data && event.notification.data.url;
  if (typeof url !== 'string' || !url.startsWith('/')) return;
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => 'focus' in client);
      if (open) {
        if ('navigate' in open) return open.navigate(url).then((c) => (c || open).focus());
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
