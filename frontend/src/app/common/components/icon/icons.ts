/**
 * Ícones de traço fino (1.5px, 24×24, `currentColor`) desenhados para o moneylog.
 * Proibido pelo DS 00: moeda, cifrão, banco, cofrinho, cadeado, escudo.
 */

/** Círculo como path (mantém todos os ícones como lista de paths). */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

export const ICONS = {
  home: ['M3.5 10.5 12 3.5l8.5 7', 'M5.5 9v11h13V9', 'M10 20v-5.5h4V20'],
  transactions: [
    'M8.5 6.5h11',
    'M8.5 12h11',
    'M8.5 17.5h11',
    'M4.5 6.5h.01',
    'M4.5 12h.01',
    'M4.5 17.5h.01',
  ],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  goals: [circle(12, 12, 8.5), circle(12, 12, 4.5), circle(12, 12, 0.75)],
  more: [circle(5.5, 12, 1), circle(12, 12, 1), circle(18.5, 12, 1)],
  cards: [
    'M5.5 5h13a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9A2.5 2.5 0 0 1 5.5 5Z',
    'M3 10h18',
    'M7 15h3',
  ],
  accounts: [
    'M12 3.5 3.5 8 12 12.5 20.5 8 12 3.5Z',
    'M3.5 12 12 16.5 20.5 12',
    'M3.5 16 12 20.5 20.5 16',
  ],
  planning: [
    'M5.5 5h13A2.5 2.5 0 0 1 21 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-11A2.5 2.5 0 0 1 5.5 5Z',
    'M3 10h18',
    'M8 3v4',
    'M16 3v4',
    'M7.5 14h.01',
    'M12 14h.01',
    'M16.5 14h.01',
  ],
  people: [
    circle(9, 8, 3.5),
    'M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6',
    'M15.5 4.6a3.5 3.5 0 0 1 0 6.8',
    'M18 14.3c2.1.8 3.5 2.8 3.5 5.7',
  ],
  notes: [
    'M6.5 3h7.5l4.5 4.5V19a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
    'M14 3v4.5h4.5',
    'M8.5 12.5h7',
    'M8.5 16.5h7',
  ],
  import: [
    'M12 3.5v11',
    'M7.5 10 12 14.5 16.5 10',
    'M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15',
  ],
  sun: [
    circle(12, 12, 4),
    'M12 3v2',
    'M12 19v2',
    'M3 12h2',
    'M19 12h2',
    'M5.6 5.6l1.4 1.4',
    'M17 17l1.4 1.4',
    'M5.6 18.4 7 17',
    'M17 7l1.4-1.4',
  ],
  moon: ['M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z'],
  monitor: ['M4 5h16v11H4Z', 'M9 20h6', 'M12 16v4'],
  bell: ['M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15Z', 'M10 20.5a2 2 0 0 0 4 0'],
  budgets: [circle(12, 12, 8.5), 'M12 3.5V12h8.5'],
  insights: ['M5 20v-8', 'M12 20V5', 'M19 20v-5', 'M3 20.5h18'],
  settings: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9', circle(15, 7, 2), circle(9, 17, 2)],
  chevronRight: ['M9.5 6 15.5 12l-6 6'],
  chevronDown: ['M6 9.5 12 15.5l6-6'],
  filter: ['M4 6h16', 'M7 12h10', 'M10 18h4'],
  close: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  chevronLeft: ['M14.5 6 8.5 12l6 6'],
  chevronUp: ['M6 14.5 12 8.5l6 6'],
  check: ['M5.5 12.5l4.5 4.5 8.5-9.5'],
  calendar: [
    'M5.5 5h13A2.5 2.5 0 0 1 21 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-11A2.5 2.5 0 0 1 5.5 5Z',
    'M3 10h18',
    'M8 3v4',
    'M16 3v4',
  ],
  search: [circle(11, 11, 6.5), 'M16 16l4.5 4.5'],
  folder: [
    'M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z',
  ],
  tag: [
    'M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-5.6 5.6a1.5 1.5 0 0 1-2.1 0Z',
    circle(8, 8, 1.2),
  ],
  trash: [
    'M4.5 6.5h15',
    'M9.5 6.5V4.5h5v2',
    'M6.5 6.5l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12',
    'M10 10.5v6',
    'M14 10.5v6',
  ],
  link: [
    'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1',
    'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  ],
  download: ['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M4 19.5h16'],
  logout: [
    'M14 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H14',
    'M10 12h10',
    'M17 8.5 20.5 12 17 15.5',
  ],
  user: [circle(12, 8.5, 3.5), 'M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5'],
  sparkle: ['M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6-5.6-1.9 5.6-1.9Z'],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;
