import { en } from '~/app/common/i18n/translations/en';
import { es } from '~/app/common/i18n/translations/es';
import { pt } from '~/app/common/i18n/translations/pt';
import {
  dailyMessageText,
  notificationLink,
  notificationText,
} from '~/app/features/notifications/notification-text';

describe('notificationText (chave de i18n + params, S-34)', () => {
  const invoice = {
    titleKey: 'notification.invoice.due3',
    params: { name: 'Cartão Roxo', amount: '1423.00', dueDate: '2026-10-10', daysLate: '0' },
  };

  it('Dado a chave da fatura, então o texto sai nos três idiomas com dinheiro e data formatados', () => {
    const ptText = notificationText(invoice, pt.notifications, 'pt-BR');
    expect(ptText.title).toBe('Fatura vence em 3 dias');
    expect(ptText.body).toContain('Cartão Roxo');
    expect(ptText.body).toMatch(/R\$\s?1\.423,00/);
    expect(ptText.body).toContain('10 de out');

    expect(notificationText(invoice, en.notifications, 'en').title).toBe('Invoice due in 3 days');
    expect(notificationText(invoice, es.notifications, 'es').title).toBe(
      'La factura vence en 3 días',
    );
  });

  it('Dado uma chave desconhecida, então mostra o texto neutro (nunca a chave crua)', () => {
    const text = notificationText(
      { titleKey: 'notification.algo.novo', params: {} },
      pt.notifications,
      'pt-BR',
    );
    expect(text).toEqual(pt.notifications.unknownMessage);
    expect(JSON.stringify(text)).not.toContain('notification.algo');
  });

  it('Dado uma chave sem o parâmetro que o texto usa, então cai no texto neutro (sem {chave} na tela)', () => {
    const text = notificationText(
      { titleKey: 'notification.invoice.due3', params: { name: 'Roxo' } },
      pt.notifications,
      'pt-BR',
    );
    expect(text).toEqual(pt.notifications.unknownMessage);
  });

  it('Dado chaves herdadas do objeto (constructor, __proto__), então não quebra e é neutro', () => {
    for (const key of ['constructor', '__proto__', 'toString']) {
      expect(notificationText({ titleKey: key, params: {} }, pt.notifications, 'pt-BR')).toEqual(
        pt.notifications.unknownMessage,
      );
    }
  });

  it('Dado o resumo do dia, então compõe saudação e números', () => {
    const text = notificationText(
      {
        titleKey: 'daily.summary',
        params: { name: 'Ana', available: '1000.50', committed7d: '200.00' },
      },
      pt.notifications,
      'pt-BR',
    );
    expect(text.body).toMatch(/^Bom dia, Ana\. Hoje você tem R\$\s?1\.000,50 disponíveis/);
  });
});

describe('dailyMessageText (T135 CA4)', () => {
  it('Dado name, available e committed7d, então "Bom dia, {nome}. Hoje você tem ... disponíveis e ... em compromissos nos próximos 7 dias."', () => {
    const text = dailyMessageText(
      { name: 'Ana', available: '3450.00', committed7d: '812.30' },
      pt.notifications,
      'pt-BR',
    );
    expect(text).toMatch(/Bom dia, Ana\./);
    expect(text).toMatch(/R\$\s?3\.450,00 disponíveis/);
    expect(text).toMatch(/R\$\s?812,30 em compromissos nos próximos 7 dias/);
  });

  it('Dado name ausente, então "Bom dia." sem nome e sem "undefined"', () => {
    const text = dailyMessageText(
      { available: '1.00', committed7d: '2.00' },
      pt.notifications,
      'pt-BR',
    );
    expect(text.startsWith('Bom dia. Hoje')).toBe(true);
    expect(text).not.toContain('undefined');
  });

  it('Dado parâmetro faltando, então o fallback é só "Bom dia."', () => {
    expect(dailyMessageText({ available: '1.00' }, pt.notifications, 'pt-BR')).toBe('Bom dia.');
    expect(dailyMessageText({}, pt.notifications, 'pt-BR')).toBe('Bom dia.');
    expect(dailyMessageText({ name: 'Ana' }, pt.notifications, 'pt-BR')).toBe('Bom dia, Ana.');
  });

  it('Dado meta com prazo, então acrescenta a meta com o progresso formatado', () => {
    const text = dailyMessageText(
      {
        available: '1.00',
        committed7d: '2.00',
        goalName: 'Viagem',
        goalProgress: '0.4250',
      },
      pt.notifications,
      'pt-BR',
    );
    expect(text).toContain('A meta Viagem está em 42,5%.');
  });
});

describe('notificationLink', () => {
  it.each([
    ['CARD', '/cards/abc'],
    ['DEBT', '/debts/abc'],
    ['GOAL', '/goals/abc'],
    ['RECURRENCE', '/planning'],
    ['REMINDER', '/notifications'],
    ['USER', '/'],
  ] as const)('Dado a referência %s, então leva a %s', (type, path) => {
    expect(notificationLink({ ref: { type, id: 'abc' } })).toBe(path);
  });
});
