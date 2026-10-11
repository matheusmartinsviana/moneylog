/**
 * Contrato de traduções (FE 04). Toda chave da UI existe aqui; cada idioma implementa o contrato
 * inteiro, então esquecer uma chave quebra o `npm run typecheck`.
 *
 * Convenções: chaves agrupadas por contexto (`shell`, `nav`, `emptyState`...), textos em sentence case.
 */

export const SUPPORTED_LANGUAGES = ['pt', 'en', 'es'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** Idioma padrão da UI (S-34). */
export const DEFAULT_LANGUAGE: Language = 'pt';

/** Valor do atributo `<html lang>` por idioma. */
export const HTML_LANG: Readonly<Record<Language, string>> = {
  pt: 'pt-BR',
  en: 'en',
  es: 'es',
};

export interface EmptyStateCopy {
  readonly title: string;
  readonly description: string;
}

export abstract class AppI18n {
  abstract readonly shell: {
    readonly brand: string;
    readonly skipToContent: string;
    /** Estado da IA ao lado do item "IA" (sidebar e Mais). */
    readonly aiOn: string;
    readonly aiOff: string;
    readonly primaryNavigation: string;
    readonly bottomNavigation: string;
    /** Rótulo curto de "Movimentações" na barra inferior de telas estreitas (só visual; o nome acessível é o completo). */
    readonly transactionsShort: string;
    readonly sidebarExpand: string;
    readonly sidebarCollapse: string;
  };

  /** Avisos do PWA: sem conexão, nova versão e instalação. */
  abstract readonly pwa: {
    readonly offlineTitle: string;
    readonly offlineText: string;
    readonly updateTitle: string;
    readonly updateText: string;
    readonly updateAction: string;
    readonly confirmTitle: string;
    readonly confirmText: string;
    readonly confirmCancel: string;
    readonly installTitle: string;
    readonly installText: string;
    readonly installIos: string;
    readonly installAction: string;
    readonly installDismiss: string;
  };

  /**
   * Um nome só por destino (S-56, S-57): o mesmo texto vale para o item da navegação, o nome
   * acessível, o título da página e os atalhos que levam até ela.
   */
  abstract readonly nav: {
    readonly home: string;
    readonly transactions: string;
    /** "Novo registro": botão da sidebar, "+" da barra inferior e título de `/quick-add`. */
    readonly quickAdd: string;
    readonly goals: string;
    readonly more: string;
    readonly cards: string;
    readonly accounts: string;
    readonly planning: string;
    readonly people: string;
    readonly notes: string;
    readonly import: string;
    /** Central de notificações (Etapa 7). */
    readonly notifications: string;
    readonly insights: string;
    /** Orçamentos (T208): página "em breve" até a fatia G (D3). */
    readonly budgets: string;
    /** Vault, IA e MCP (fatia F): páginas honestas do espaço de trabalho. */
    readonly vault: string;
    readonly ai: string;
    readonly mcp: string;
    readonly settings: string;
    /** Títulos dos grupos da sidebar e do `/more` (DS 02). Não são destinos: ficam fora de `NavKey`. */
    readonly groups: {
      readonly overview: string;
      readonly workspace: string;
      readonly system: string;
    };
  };

  /** Páginas do espaço de trabalho (fatia F): vault, IA e MCP, sempre honestas sobre o que existe. */
  abstract readonly workspacePages: {
    readonly vault: {
      readonly subtitle: string;
      readonly cardTitle: string;
      readonly lastChange: string;
      readonly noChanges: string;
      readonly foldersLabel: string;
      readonly notesTitle: string;
      readonly previewTitle: string;
      readonly selectNote: string;
      readonly metadataTitle: string;
      readonly openEditor: string;
      readonly createNote: string;
      readonly loading: string;
      readonly error: string;
      readonly retry: string;
      readonly emptyTitle: string;
      readonly emptyDescription: string;
      readonly folderEmpty: string;
      readonly previewError: string;
    };
    readonly ai: {
      readonly subtitle: string;
      readonly statusTitle: string;
      readonly notConfigured: string;
      readonly notConfiguredDescription: string;
      readonly worksWithout: string;
      readonly providersTitle: string;
      readonly providersNote: string;
      readonly howTitle: string;
      readonly howIntro: string;
      readonly varProvider: string;
      readonly varKey: string;
      readonly varModel: string;
      readonly howNote: string;
      readonly privacyTitle: string;
      readonly privacyText: string;
    };
    readonly mcp: {
      readonly subtitle: string;
      readonly soon: string;
      readonly description: string;
      readonly toolsTitle: string;
      readonly planned: string;
      readonly tools: {
        readonly readTransactions: string;
        readonly analyzeSpending: string;
        readonly generateReports: string;
        readonly createPending: string;
        readonly generateNotes: string;
      };
      readonly accessTitle: string;
      readonly accessText: string;
    };
  };

  /** Cabeçalho do workspace (T194): saudação sem nome (D4), ações rápidas, chip de IA e menu do perfil. */
  abstract readonly header: {
    readonly greeting: {
      readonly morning: string;
      readonly afternoon: string;
      readonly evening: string;
    };
    /** Alternador de tema; `toggle` usa `{current}` e `{next}`. */
    readonly theme: {
      readonly toggle: string;
      readonly toLight: string;
      readonly toDark: string;
      readonly system: string;
      readonly light: string;
      readonly dark: string;
    };
    readonly subtitle: string;
    readonly actions: {
      readonly label: string;
      readonly addExpense: string;
      readonly addIncome: string;
      readonly transfer: string;
      readonly askAi: string;
      readonly askAiHint: string;
    };
    readonly aiOff: string;
    readonly aiOn: string;
    readonly profile: { readonly label: string; readonly signOut: string };
  };

  /** Gráficos em SVG próprio (fatia B, ADR-011): estados, tabela equivalente, dica de teclado e rótulos. */
  abstract readonly charts: {
    readonly empty: string;
    readonly viewAsTable: string;
    readonly hideTable: string;
    readonly keyboardHint: string;
    readonly periodColumn: string;
    /** `{count}` categorias agrupadas em "Outras". */
    readonly other: string;
    readonly otherOne: string;
    readonly demo: string;
    /** `{label}` título do gráfico, `{series}` nomes das séries, `{points}` quantidade de pontos. */
    readonly summary: string;
    readonly segmentedDisabled: string;
  };

  abstract readonly emptyState: {
    readonly comingSoon: string;
    readonly home: EmptyStateCopy & {
      readonly addAccount: string;
      readonly importStatement: string;
    };
    readonly transactions: EmptyStateCopy & {
      readonly addTransaction: string;
      readonly importStatement: string;
    };
    readonly goals: EmptyStateCopy & { readonly createGoal: string };
    readonly accounts: EmptyStateCopy & { readonly addAccount: string };
    readonly cards: EmptyStateCopy & { readonly addCard: string };
    readonly planning: EmptyStateCopy & { readonly addRecurrence: string };
    readonly people: EmptyStateCopy & { readonly addPerson: string };
    readonly notes: EmptyStateCopy & { readonly createNote: string; readonly importVault: string };
    readonly import: EmptyStateCopy & { readonly chooseFile: string };
    readonly insights: EmptyStateCopy & { readonly addTransaction: string };
    readonly settings: EmptyStateCopy & { readonly connectAi: string };
    readonly budgets: EmptyStateCopy;
  };

  /** Início (dashboard, T19). Valores e datas vêm da API; aqui só rótulos. */
  abstract readonly home: {
    /** `{date}`: data de referência do resumo. */
    readonly asOf: string;
    readonly projection: string;
    readonly loading: string;
    /** Uma recarga em segundo plano falhou: o Início mostra o último dado bom e este aviso. */
    readonly refreshFailed: string;
    readonly error: EmptyStateCopy & { readonly retry: string };
    readonly forbidden: EmptyStateCopy;
    readonly available: {
      readonly title: string;
      readonly description: string;
      readonly inAccounts: string;
      readonly committed30d: string;
      readonly reserved: string;
      readonly investments: string;
      readonly negative: string;
    };
    readonly committed: {
      readonly title: string;
      readonly description: string;
      readonly committedRow: string;
      readonly projectedRow: string;
      readonly projectionNote: string;
      readonly horizons: {
        readonly d7: string;
        readonly d30: string;
        readonly d60: string;
        readonly d90: string;
        readonly m6: string;
        readonly m12: string;
      };
      readonly notApplicable: string;
    };
    readonly upcoming: {
      readonly title: string;
      readonly description: string;
      readonly empty: string;
      readonly undated: string;
      /** Havia mais de 500 vencidas: só as mais recentes aparecem (S-240). */
      readonly overdueTruncated: string;
      readonly totalOut: string;
      readonly totalIn: string;
      readonly installments: string;
      /** `{date}`: vencimento do item. */
      readonly due: string;
      readonly buckets: {
        readonly OVERDUE: string;
        readonly TODAY: string;
        readonly TOMORROW: string;
        readonly NEXT_7_DAYS: string;
        readonly NEXT_30_DAYS: string;
        readonly LATER: string;
      };
      readonly kinds: {
        readonly INVOICE: string;
        readonly INVOICE_FORECAST: string;
        readonly DEBT_PAYABLE: string;
        readonly DEBT_RECEIVABLE: string;
        readonly RECURRENCE: string;
        readonly SCHEDULED_TRANSACTION: string;
      };
      readonly incoming: string;
      readonly totalInNote: string;
      readonly realize: string;
      /** `{label}`: descrição do compromisso. */
      readonly realizeLabel: string;
      readonly openDebt: string;
      readonly openPending: string;
    };
    readonly month: {
      readonly title: string;
      readonly income: string;
      readonly consumption: string;
      readonly net: string;
      readonly expensesPaid: string;
      readonly methods: {
        readonly DEBIT: string;
        readonly PIX: string;
        readonly CASH: string;
        readonly BOLETO: string;
        readonly TRANSFER: string;
        readonly OTHER: string;
      };
      readonly credit: string;
      readonly refunds: string;
      readonly consumptionNote: string;
      readonly cashFlow: string;
      readonly cashIn: string;
      readonly cashOut: string;
      readonly cashNet: string;
      readonly investedNet: string;
      readonly debtConsumption: string;
      readonly lent: string;
      readonly received: string;
    };
    readonly netWorth: {
      readonly title: string;
      readonly accounts: string;
      readonly receivables: string;
      readonly cardLiabilities: string;
      readonly payables: string;
      readonly total: string;
      readonly cardFutureInstallments: string;
      readonly cardFutureInstallmentsNote: string;
    };
    /** Reservado em metas (T101): o texto da fórmula e o caminho para as metas. */
    readonly reservedNote: {
      readonly formula: string;
      readonly goalsLink: string;
    };
    /** Cartões no Início (T71): os dois "comprometido" ficam separados, nunca somados. */
    readonly cards: {
      readonly title: string;
      readonly description: string;
      readonly loading: string;
      readonly error: string;
      readonly retry: string;
      readonly empty: string;
      readonly add: string;
      /** `{name}`: nome do cartão. */
      readonly open: string;
      readonly available: string;
      readonly overLimit: string;
      readonly totalCommitted: string;
      readonly committedFuture: string;
      readonly note: string;
    };
  };

  /** Início redesenhado (fatia C1): KPIs, contas, gráficos, recentes, insight e orçamento "em breve". */
  abstract readonly dashboard: {
    readonly kpis: {
      readonly label: string;
      readonly thisMonth: string;
      readonly thisMonthPartial: string;
      readonly projection: string;
      readonly inAccounts: { readonly title: string };
      readonly spending: { readonly title: string };
      readonly income: { readonly title: string };
      readonly savings: { readonly title: string; readonly noIncome: string };
      /** `{value}`: a razão do backend, só formatada. */
      readonly delta: {
        readonly lower: string;
        readonly higher: string;
        readonly same: string;
        readonly noBase: string;
        readonly partial: string;
        readonly since: string;
        readonly points: string;
        readonly pointsPartial: string;
      };
      readonly unavailable: string;
      readonly retry: string;
      readonly loading: string;
    };
    readonly overview: {
      readonly title: string;
      readonly periodLabel: string;
      readonly basis: { readonly DATE: string; readonly COMPETENCE: string };
      readonly periods: {
        readonly D7: string;
        readonly D30: string;
        readonly M3: string;
        readonly M12: string;
      };
      readonly income: string;
      readonly expenses: string;
      readonly empty: string;
      readonly error: string;
      readonly retry: string;
      readonly loading: string;
    };
    readonly categories: {
      readonly title: string;
      readonly description: string;
      readonly total: string;
      /** `{name}`: nome da categoria. */
      readonly open: string;
      readonly empty: string;
      readonly error: string;
      readonly retry: string;
      readonly loading: string;
    };
  };

  /** IA (Etapa 8): estado, prévia e consentimento, resultado, histórico, insights e preferências. */
  abstract readonly ai: {
    readonly status: {
      readonly on: string;
      /** `{provider}` e `{model}`. */
      readonly providerLine: string;
      /** `{calls}` e `{tokens}`. */
      readonly remaining: string;
      readonly circuitOpen: string;
      readonly loading: string;
      readonly error: string;
      readonly retry: string;
    };
    readonly actions: {
      readonly title: string;
      readonly hint: string;
      readonly summary: string;
      readonly insights: string;
      readonly disabled: string;
    };
    readonly purposes: Readonly<Record<string, string>>;
    readonly consent: {
      readonly title: string;
      readonly intro: string;
      readonly purpose: string;
      readonly period: string;
      readonly counts: string;
      readonly countLabels: Readonly<Record<string, string>>;
      /** `{tokens}`. */
      readonly tokens: string;
      readonly payload: string;
      readonly redactions: string;
      readonly redactionTypes: Readonly<Record<string, string>>;
      readonly noRedactions: string;
      readonly cancel: string;
      readonly send: string;
      readonly sending: string;
      readonly preparing: string;
      readonly redo: string;
      readonly review: string;
    };
    readonly result: {
      readonly title: string;
      readonly badge: string;
      readonly warning: string;
      readonly caveat: string;
      readonly close: string;
      readonly fallbackTitle: string;
      readonly ungrounded: string;
      readonly failed: string;
      readonly denied: string;
      readonly budget: string;
      readonly fallbackBody: string;
    };
    readonly history: {
      readonly title: string;
      readonly empty: string;
      readonly emptyHint: string;
      readonly error: string;
      readonly retry: string;
      readonly loading: string;
      readonly loadMore: string;
      /** `{input}` e `{output}`. */
      readonly tokens: string;
      readonly statuses: Readonly<Record<string, string>>;
      readonly viewPayload: string;
      readonly hidePayload: string;
      /** `{date}`. */
      readonly purged: string;
    };
    readonly insights: {
      readonly title: string;
      readonly source: string;
      /** `{category}`, `{percent}`, `{previous}`, `{current}`. */
      readonly categoryUp: string;
      readonly categoryDown: string;
      /** `{amount}`. */
      readonly cardCommitted: string;
      readonly empty: string;
      readonly emptyHint: string;
      readonly error: string;
      readonly retry: string;
      readonly loading: string;
      readonly viewAll: string;
      readonly viewSpending: string;
    };
    readonly settings: {
      readonly title: string;
      readonly label: string;
      readonly hint: string;
      readonly saved: string;
      readonly error: string;
      readonly loading: string;
      readonly retry: string;
    };
  };

  /** Busca global do cabeçalho (T209). */
  abstract readonly search: {
    readonly label: string;
    readonly placeholder: string;
    readonly open: string;
    readonly sheetTitle: string;
    readonly hint: string;
    readonly loading: string;
    /** `{q}`: o termo buscado. */
    readonly empty: string;
    /** `{count}`: quantos resultados (anunciado em região viva). */
    readonly count: string;
    readonly countOne: string;
    readonly truncated: string;
    readonly retry: string;
    readonly archived: string;
    readonly listLabel: string;
    readonly errors: {
      readonly generic: string;
      readonly invalid: string;
      readonly rateLimit: string;
    };
    readonly groups: {
      readonly transactions: string;
      readonly accounts: string;
      readonly categories: string;
      readonly cards: string;
      readonly notes: string;
    };
  };

  abstract readonly more: {
    readonly description: string;
  };

  abstract readonly settings: {
    readonly preferences: string;
    readonly preferencesDescription: string;
    readonly language: string;
    readonly theme: string;
    readonly themeSystem: string;
    readonly themeLight: string;
    readonly themeDark: string;
    readonly languageNames: Readonly<Record<Language, string>>;
  };

  /** Componentes de formulário compartilhados (T32): campos, erros, diálogo de confirmação e avisos. */
  abstract readonly form: {
    /** `{currency}`: nome da moeda do dado, no idioma da UI (ex.: "Real brasileiro"). */
    readonly amountCurrency: string;
    readonly selectPlaceholder: string;
    readonly noOptions: string;
    /** Controles próprios (UI sem controles nativos do navegador). */
    readonly ui: {
      readonly close: string;
      readonly clear: string;
      readonly search: string;
      readonly noResults: string;
      /** `{count}`: quantidade de opções visíveis (anunciada ao filtrar). */
      readonly resultsCount: string;
      readonly on: string;
      readonly off: string;
    };
    /** Fechar um formulário em modal com alterações não salvas. */
    readonly discard: {
      readonly title: string;
      readonly description: string;
      readonly confirm: string;
      readonly stay: string;
    };
    /** Contador numérico (`NumberStepper`). */
    readonly stepper: {
      readonly decrease: string;
      readonly increase: string;
    };
    /** Texto de estado da `ProgressBar` (o estado nunca é só cor). */
    readonly progress: {
      readonly warning: string;
      readonly risk: string;
    };
    readonly date: {
      /** Máscara exibida no campo (ex.: `dd/mm/aaaa`). */
      readonly placeholder: string;
      /** `{format}`: a máscara. */
      readonly formatHint: string;
      readonly openCalendar: string;
      readonly chooseDate: string;
      readonly today: string;
      readonly yesterday: string;
      readonly previousMonth: string;
      readonly nextMonth: string;
      readonly previousYear: string;
      readonly nextYear: string;
      /** `{month}`: mês e ano exibidos (nome acessível do botão do título do calendário). */
      readonly chooseMonthYearNamed: string;
      /** `{month}`: mês e ano (ex.: "outubro de 2026"). */
      readonly calendarOf: string;
      readonly chooseMonth: string;
      readonly monthPlaceholder: string;
    };
    /** Mensagens de validação: aparecem só depois que o campo é tocado. */
    readonly errors: {
      readonly required: string;
      readonly invalid: string;
      /** `{example}`: valor de exemplo no formato da moeda (ex.: 1.234,56). */
      readonly moneyFormat: string;
      /** `{digits}`: casas decimais da moeda. */
      readonly moneyScale: string;
      readonly moneyNegative: string;
      readonly moneyZero: string;
      readonly dateFormat: string;
      /** `{date}`: data mínima aceita. */
      readonly dateMin: string;
      /** `{date}`: data máxima aceita. */
      readonly dateMax: string;
      /** `{month}`: mês mínimo aceito. */
      readonly monthMin: string;
      /** `{month}`: mês máximo aceito. */
      readonly monthMax: string;
      /** `{max}`: quantidade máxima de caracteres. */
      readonly maxlength: string;
    };
    readonly dialog: {
      readonly cancel: string;
      readonly reason: string;
      readonly reasonHint: string;
    };
    readonly toast: {
      readonly dismiss: string;
    };
    /** Seletor de arquivo próprio (`FilePicker`): o `<input type="file">` fica escondido dentro dele. */
    readonly filePicker: {
      readonly choose: string;
      readonly change: string;
      readonly remove: string;
      readonly dropHint: string;
      /** `{name}`: anunciado quando um arquivo é recebido (por escolha ou por arrastar e soltar). */
      readonly received: string;
      /** `{max}`: tamanho máximo, já formatado. */
      readonly tooLarge: string;
      /** `{types}`: extensões aceitas. */
      readonly wrongType: string;
      readonly empty: string;
    };
  };

  /** Autenticação (T33): login e sessão. Mensagens de erro por motivo, nunca o texto do backend. */
  abstract readonly auth: {
    readonly pageTitle: string;
    readonly login: {
      readonly title: string;
      readonly description: string;
      readonly email: string;
      readonly password: string;
      readonly submit: string;
      readonly submitting: string;
      readonly errors: {
        readonly invalid: string;
        /** `{minutes}`: espera até poder tentar de novo. */
        readonly rateLimited: string;
        readonly network: string;
        readonly unavailable: string;
      };
      /** Aviso discreto quando não deu para consultar se é o primeiro acesso. */
      readonly statusUnavailable: string;
      readonly checking: string;
    };
    /** Primeiro acesso: definir a senha com o código de configuração (ADR-015). */
    readonly setup: {
      readonly title: string;
      readonly description: string;
      readonly email: string;
      readonly code: string;
      readonly codeHint: string;
      readonly newPassword: string;
      readonly confirmPassword: string;
      readonly show: string;
      readonly hide: string;
      readonly rulesTitle: string;
      readonly ruleLength: string;
      readonly ruleBytes: string;
      readonly ruleNotEmail: string;
      readonly submit: string;
      readonly submitting: string;
      /** `{seconds}`: espera até poder tentar de novo. */
      readonly retryIn: string;
      readonly errors: {
        readonly invalidCode: string;
        readonly weakPassword: string;
        /** `{seconds}`: espera até poder tentar de novo. */
        readonly rateLimited: string;
        readonly validation: string;
        readonly network: string;
        readonly unavailable: string;
      };
    };
    readonly session: {
      readonly title: string;
      readonly description: string;
      readonly signOut: string;
      readonly signingOut: string;
    };
  };

  /** Falhas da API, traduzidas pelo `code` (nunca pela mensagem do backend). */
  abstract readonly errors: {
    readonly network: string;
    readonly unavailable: string;
    readonly validation: string;
    /** 422 com `code` que o front não conhece: a regra recusou, os dados precisam de revisão. */
    readonly unprocessable: string;
    readonly load: EmptyStateCopy & { readonly retry: string };
    /** Texto por `code` do contrato; `code` fora da lista cai nas mensagens genéricas acima. */
    readonly codes: Readonly<Record<string, string>>;
  };

  /** Contas (T36). */
  abstract readonly accounts: {
    /** Reserva descoberta (S-148): a conta tem menos saldo que o reservado em metas. Só avisa. */
    readonly uncovered: string;
    readonly tabsLabel: string;
    readonly active: string;
    readonly archivedTab: string;
    readonly add: string;
    readonly loading: string;
    readonly emptyArchived: string;
    readonly types: Readonly<Record<'CHECKING' | 'SAVINGS' | 'WALLET' | 'INVESTMENT', string>>;
    readonly columns: {
      readonly name: string;
      readonly type: string;
      readonly institution: string;
      readonly balance: string;
      readonly actions: string;
    };
    readonly negativeBalance: string;
    readonly edit: string;
    readonly archive: string;
    readonly unarchive: string;
    readonly archiveHint: string;
    /** Atalho do aviso de conta com reserva ativa (422 ACCOUNT_HAS_RESERVATIONS). */
    readonly reservationsGoalsLink: string;
    readonly archiveConfirm: {
      /** `{name}`: nome da conta. */
      readonly title: string;
      readonly description: string;
      readonly confirm: string;
    };
    readonly toast: {
      /** `{name}`: nome da conta. */
      readonly created: string;
      readonly updated: string;
      readonly archived: string;
      readonly unarchived: string;
    };
    readonly form: {
      readonly createTitle: string;
      readonly editTitle: string;
      readonly name: string;
      readonly type: string;
      readonly institution: string;
      readonly optional: string;
      readonly openingBalance: string;
      readonly openingDate: string;
      readonly moreOptions: string;
      readonly lockedHint: string;
      readonly save: string;
      readonly saving: string;
      readonly cancel: string;
      readonly conflict: string;
      readonly notFound: EmptyStateCopy & { readonly back: string };
    };
  };

  /** Categorias em Configurações (T37). */
  abstract readonly categories: {
    readonly title: string;
    readonly description: string;
    readonly settingsLink: string;
    readonly backToSettings: string;
    readonly tabsLabel: string;
    readonly kinds: Readonly<Record<'EXPENSE' | 'INCOME', string>>;
    readonly loading: string;
    readonly empty: EmptyStateCopy;
    readonly add: string;
    readonly newName: string;
    readonly create: string;
    readonly cancel: string;
    readonly system: string;
    /** `{count}`: quantidade de categorias arquivadas. */
    readonly archivedGroup: string;
    readonly rename: string;
    readonly renameLabel: string;
    readonly renameHint: string;
    readonly save: string;
    readonly archive: string;
    readonly unarchive: string;
    readonly archiveConfirm: {
      /** `{name}`: nome da categoria. */
      readonly title: string;
      readonly description: string;
      readonly confirm: string;
    };
    readonly toast: {
      /** `{name}`: nome da categoria. */
      readonly created: string;
      readonly renamed: string;
      readonly archived: string;
      readonly unarchived: string;
    };
  };

  /** Movimentações: lista, filtros e totais (T39). Valores vêm da API; aqui só rótulos. */
  abstract readonly transactions: {
    /** Despesa de terceiro (2.14.0): selo, marca e vínculo com o reembolso. */
    readonly incomeOf: string;
    readonly thirdParty: {
      readonly badge: string;
      /** `{name}`: pessoa responsável. */
      readonly badgeFor: string;
      readonly action: string;
      readonly modal: {
        readonly title: string;
        readonly description: string;
        readonly person: string;
        readonly note: string;
        readonly save: string;
        readonly saving: string;
        readonly cancel: string;
        readonly toast: string;
      };
      readonly detail: {
        readonly title: string;
        readonly person: string;
        readonly owed: string;
        readonly received: string;
        readonly pending: string;
        readonly rule: string;
        readonly register: string;
        readonly openList: string;
      };
    };
    readonly loading: string;
    readonly voided: string;
    readonly noCategory: string;
    readonly open: string;
    /** Linha de consumo que nasce de uma dívida sem movimentação (S-137). */
    readonly debtEntry: string;
    /** `{description}`: a dívida. */
    readonly openDebt: string;
    readonly views: {
      readonly label: string;
      readonly records: string;
      readonly entries: string;
    };
    readonly columns: {
      readonly date: string;
      readonly description: string;
      readonly type: string;
      readonly category: string;
      readonly account: string;
      readonly method: string;
      readonly amount: string;
      readonly competence: string;
    };
    readonly types: Readonly<
      Record<
        | 'EXPENSE'
        | 'INCOME'
        | 'TRANSFER'
        | 'INVESTMENT'
        | 'ADJUSTMENT'
        | 'REFUND'
        | 'CARD_PURCHASE'
        | 'INVOICE_PAYMENT'
        | 'LOAN_GIVEN'
        | 'MONEY_RECEIVED'
        | 'DEBT_PAYMENT',
        string
      >
    >;
    readonly methods: Readonly<
      Record<'CASH' | 'DEBIT' | 'PIX' | 'TRANSFER' | 'BOLETO' | 'OTHER', string>
    >;
    readonly directions: Readonly<
      Record<'CONTRIBUTION' | 'REDEMPTION' | 'INCREASE' | 'DECREASE', string>
    >;
    readonly filters: {
      readonly title: string;
      readonly open: string;
      readonly date: string;
      readonly from: string;
      readonly to: string;
      readonly competence: string;
      readonly lens: string;
      readonly lensConsumption: string;
      readonly lensIncome: string;
      readonly type: string;
      readonly account: string;
      readonly category: string;
      readonly method: string;
      readonly search: string;
      readonly searchPlaceholder: string;
      readonly voidedOnly: string;
      readonly allTypes: string;
      readonly allAccounts: string;
      readonly allCategories: string;
      readonly allMethods: string;
      readonly clear: string;
    };
    readonly totals: {
      readonly label: string;
      readonly count: string;
      readonly in: string;
      readonly out: string;
      readonly net: string;
      /** Com filtro de conta: o líquido é o movimento daquela conta (revisão A25). */
      readonly netAccount: string;
      readonly total: string;
      readonly byCategory: string;
      readonly voidedNote: string;
    };
    readonly loadMore: string;
    readonly loadingMore: string;
    readonly loadMoreFailed: string;
    readonly adjustmentKinds: Readonly<Record<'CORRECTION' | 'YIELD', string>>;
    /** Detalhe, estorno e edição de uma movimentação (T40). */
    readonly detail: {
      readonly loading: string;
      readonly close: string;
      readonly back: string;
      readonly edit: string;
      readonly fields: {
        readonly date: string;
        readonly type: string;
        readonly category: string;
        readonly card: string;
        readonly invoice: string;
        readonly account: string;
        readonly accountFrom: string;
        readonly counterpartTo: string;
        readonly counterpartInvestment: string;
        readonly method: string;
        readonly direction: string;
        readonly adjustmentKind: string;
        readonly reason: string;
        readonly refundOf: string;
        readonly notes: string;
        readonly debt: string;
        /** `{name}`: pessoa da parte (despesa dividida). */
        readonly share: string;
        readonly recurrence: string;
        /** `{date}`: data da ocorrência realizada. */
        readonly recurrenceOccurrence: string;
      };
      readonly impact: {
        readonly title: string;
        readonly cash: string;
        /** `{competence}`: mês curto, ex.: `out/2026`. */
        readonly consumption: string;
        readonly netWorth: string;
        /** Compromisso futuro da compra no cartão (faturas ainda não abertas); nunca se soma ao resto. */
        readonly commitment: string;
      };
      readonly voided: {
        /** `{date}`: data e hora do estorno. */
        readonly on: string;
        readonly reason: string;
      };
      readonly void: {
        readonly action: string;
        readonly title: string;
        readonly description: string;
        readonly confirm: string;
        readonly reasonLabel: string;
        readonly toast: string;
        readonly blocked: Readonly<
          Record<
            | 'ACCOUNT_ARCHIVED'
            | 'HAS_ACTIVE_REFUNDS'
            | 'TRANSACTION_IN_CLOSED_INVOICE'
            | 'DEBT_HAS_SETTLEMENTS'
            | 'DEBT_CLOSED',
            string
          >
        >;
      };
      /** Compra no cartão (T70): parcelas, cancelamento das restantes e fatura. */
      readonly installments: {
        readonly title: string;
        /** `{month}` e `{date}`: referência e vencimento da fatura da parcela. */
        readonly invoice: string;
        readonly lateEntry: string;
        readonly lateEntryHint: string;
        readonly viewInvoice: string;
      };
      readonly cancel: {
        readonly action: string;
        readonly title: string;
        readonly description: string;
        readonly confirm: string;
        readonly reasonLabel: string;
        readonly toast: string;
      };
      readonly notFound: EmptyStateCopy & { readonly back: string };
      readonly editPage: {
        readonly title: string;
        readonly notEditable: string;
        readonly toast: string;
      };
    };
  };

  /** `/quick-add` (T38, T41). */
  abstract readonly quickAdd: {
    readonly loading: string;
    readonly modes: {
      readonly label: string;
      readonly expense: string;
      readonly pix: string;
      readonly debit: string;
      readonly income: string;
      readonly transfer: string;
      readonly credit: string;
      readonly investment: string;
      readonly adjustment: string;
      readonly refund: string;
      /** Pessoas e dívidas (Etapa 4): emprestar, receber e registrar dívida. */
      readonly loan: string;
      readonly received: string;
      readonly debt: string;
      /** Cabeçalhos dos grupos do seletor de tipo. */
      readonly groups: {
        readonly spending: string;
        readonly inflow: string;
        readonly between: string;
        readonly people: string;
        readonly other: string;
      };
      /** Título do modal por tipo. */
      readonly titles: {
        readonly expense: string;
        readonly pix: string;
        readonly debit: string;
        readonly credit: string;
        readonly income: string;
        readonly transfer: string;
        readonly investment: string;
        readonly adjustment: string;
        readonly refund: string;
        readonly loan: string;
        readonly received: string;
        readonly debt: string;
      };
    };
    readonly toast: {
      /** `{description}` e `{amount}`: o registro como o backend devolveu. */
      readonly saved: string;
      readonly viewTransactions: string;
      readonly viewInvoice: string;
      readonly viewDebt: string;
      readonly viewDetails: string;
      readonly newEntry: string;
    };
    readonly empty: {
      readonly noAccount: EmptyStateCopy & { readonly action: string };
      readonly needTwoAccounts: EmptyStateCopy & { readonly action: string };
      readonly noInvestmentAccount: EmptyStateCopy & { readonly action: string };
      readonly noCard: EmptyStateCopy & { readonly action: string };
    };
  };

  /** Campos comuns dos formulários de movimentação (quick-add e edição). */
  abstract readonly entryForm: {
    readonly pixLoanToggle: string;
    readonly amount: string;
    readonly description: string;
    readonly category: string;
    readonly account: string;
    readonly date: string;
    readonly method: string;
    readonly from: string;
    readonly to: string;
    readonly save: string;
    readonly saving: string;
    readonly retry: string;
    readonly cancel: string;
    /** `{default}`: a descrição usada quando o campo fica vazio. */
    readonly descriptionHint: string;
    readonly optionalHint: string;
    readonly incomeMonth: {
      readonly label: string;
      readonly hint: string;
      readonly next: string;
    };
    readonly noCategory: string;
    readonly investment: {
      readonly cashAccount: string;
      readonly investmentAccount: string;
      readonly direction: string;
    };
    readonly adjustment: {
      readonly direction: string;
      readonly kind: string;
      readonly reason: string;
      readonly help: string;
      readonly yieldNeedsInvestment: string;
      readonly defaultDescription: string;
    };
    readonly refund: {
      readonly original: string;
      readonly originalHint: string;
      readonly originalPlaceholder: string;
      readonly searching: string;
      readonly noResults: string;
      readonly resultsLabel: string;
      readonly remove: string;
      readonly categoryLocked: string;
      readonly defaultDescription: string;
      /** `{description}`: a despesa original. */
      readonly defaultDescriptionOf: string;
      /** Para onde vai o reembolso: conta ou crédito no cartão (T70 CA4). */
      readonly target: string;
      readonly toAccount: string;
      readonly toCard: string;
      readonly card: string;
    };
  };

  /** Cartões, faturas, pagamento e compra parcelada (Etapa 3). Valores e datas vêm da API; aqui só rótulos. */
  abstract readonly cards: {
    readonly loading: string;
    readonly tabsLabel: string;
    readonly active: string;
    readonly archivedTab: string;
    readonly add: string;
    readonly emptyArchived: string;
    readonly columns: {
      readonly name: string;
      readonly limit: string;
      readonly invoice: string;
      readonly actions: string;
    };
    readonly limit: {
      readonly label: string;
      /** `{available}` e `{limit}`: valores do backend, já formatados. */
      readonly summary: string;
      readonly overLimit: string;
      /** `{available}`: disponível (negativo) quando passou do limite. */
      readonly overLimitSummary: string;
      readonly creditBalance: string;
      /** Cartão sem limite cadastrado: sem barra, sem percentual, sem "disponível". */
      readonly notSet: string;
    };
    /** Fechamento não confirmado (`closingConfirmed = false`). */
    readonly closing: {
      readonly badge: string;
      readonly hint: string;
      readonly action: string;
      readonly modalTitle: string;
      readonly modalDescription: string;
      readonly adjust: string;
      readonly confirm: string;
      readonly confirming: string;
      readonly toast: string;
    };
    readonly noInvoice: string;
    /** `{month}` (ex.: nov/2026) e `{date}`: referência e vencimento da fatura. */
    readonly invoiceLine: string;
    readonly edit: string;
    readonly archive: string;
    readonly unarchive: string;
    readonly archiveHint: string;
    readonly archiveConfirm: {
      /** `{name}`: nome do cartão. */
      readonly title: string;
      readonly description: string;
      readonly confirm: string;
    };
    readonly pendingBalance: {
      /** `{name}`: nome do cartão. */
      readonly message: string;
      readonly link: string;
    };
    readonly toast: {
      /** `{name}`: nome do cartão. */
      readonly created: string;
      readonly updated: string;
      readonly archived: string;
      readonly unarchived: string;
    };
    readonly statuses: Readonly<Record<'FUTURE' | 'OPEN' | 'CLOSED' | 'OVERDUE' | 'PAID', string>>;
    readonly installmentStatuses: Readonly<
      Record<'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED', string>
    >;
    readonly form: {
      readonly createTitle: string;
      readonly editTitle: string;
      readonly name: string;
      readonly institution: string;
      readonly optional: string;
      readonly limit: string;
      readonly limitHint: string;
      readonly closingDay: string;
      readonly dueDay: string;
      /** `{day}`: dia do mês. */
      readonly dayValue: string;
      readonly daysHint: string;
      readonly defaultAccount: string;
      readonly defaultAccountHint: string;
      readonly noDefaultAccount: string;
      readonly noAccounts: string;
      readonly privacy: string;
      readonly save: string;
      readonly saving: string;
      readonly cancel: string;
      readonly conflict: string;
      readonly notFound: EmptyStateCopy & { readonly back: string };
    };
    /** Prévia da mudança de fechamento/vencimento (T69). */
    readonly billingChange: {
      readonly title: string;
      readonly loading: string;
      /** `{closing}` e `{due}`: datas da primeira fatura afetada, no calendário novo. */
      readonly firstInvoice: string;
      readonly keep: string;
      /** `{installments}` e `{credits}`: quantidades do backend. */
      readonly moved: string;
      readonly movedNone: string;
      readonly stale: string;
      readonly error: string;
      readonly waiting: string;
    };
    /** Tela do cartão (T65). */
    readonly detail: {
      readonly loading: string;
      readonly notFound: EmptyStateCopy & { readonly back: string };
      readonly limitLabel: string;
      readonly availableLabel: string;
      readonly creditBalanceLabel: string;
      /** `{closing}` e `{due}`: dias do mês. */
      readonly days: string;
      /** `{amount}`: `committedFuture` do backend. */
      readonly committedFuture: string;
      readonly committedFutureNote: string;
      readonly totalCommittedLabel: string;
      readonly actionsLabel: string;
      readonly payInvoice: string;
      readonly newPurchase: string;
      readonly edit: string;
      readonly nothingToPay: string;
      readonly payInvoicesLoading: string;
      readonly payInvoicesError: string;
      readonly tabs: {
        readonly label: string;
        readonly invoices: string;
        readonly future: string;
      };
      readonly invoicesLoading: string;
      readonly invoicesEmpty: string;
      readonly futureLoading: string;
      readonly futureEmpty: string;
      readonly futureTotal: string;
      readonly invoiceRow: {
        /** `{month}`: referência da fatura. */
        readonly reference: string;
        /** `{from}` e `{to}`: período da fatura. */
        readonly period: string;
        /** `{date}`: data de fechamento. */
        readonly closing: string;
        /** `{date}`: data de vencimento. */
        readonly due: string;
        readonly outstanding: string;
        /** `{month}`: referência. */
        readonly open: string;
        readonly lateEntry: string;
        readonly lateEntryHint: string;
      };
    };
    /** Detalhe da fatura (T66). */
    readonly invoice: {
      readonly loading: string;
      /** `{month}`: referência da fatura. */
      readonly heading: string;
      readonly notFound: EmptyStateCopy & { readonly back: string };
      readonly backToCard: string;
      readonly summary: {
        readonly total: string;
        readonly carryIn: string;
        readonly paid: string;
        readonly outstanding: string;
        readonly creditCarry: string;
        readonly closing: string;
        readonly due: string;
        readonly status: string;
      };
      readonly itemsTitle: string;
      readonly itemsEmpty: string;
      readonly credit: string;
      readonly lateEntry: string;
      readonly lateEntryHint: string;
      readonly columns: {
        readonly date: string;
        readonly description: string;
        readonly amount: string;
      };
      /** `{description}`: o item. */
      readonly openItem: string;
      readonly paymentsTitle: string;
      readonly paymentsEmpty: string;
      readonly paymentOpen: string;
      readonly overdueWarning: string;
      readonly pay: string;
      readonly payBlocked: Readonly<Record<'PAID' | 'FUTURE', string>>;
    };
    /** Pagamento de fatura (T68). */
    readonly pay: {
      /** `{month}`: referência da fatura. */
      readonly title: string;
      readonly description: string;
      readonly account: string;
      readonly amount: string;
      readonly amountHint: string;
      readonly date: string;
      readonly noAccounts: string;
      readonly addAccount: string;
      readonly scheduled: string;
      readonly preview: {
        readonly loading: string;
        readonly FULL: string;
        /** `{amount}`: `outstandingAfter` do backend. */
        readonly PARTIAL: string;
        /** `{amount}`: `creditCarryAfter` do backend. */
        readonly OVERPAY: string;
        readonly PREPAY: string;
        readonly unavailable: string;
      };
      readonly submit: string;
      readonly submitting: string;
      readonly cancel: string;
      readonly retry: string;
      readonly toast: string;
    };
    /** Compra no cartão em `/quick-add` (T67). */
    readonly purchase: {
      readonly card: string;
      readonly amount: string;
      readonly description: string;
      readonly category: string;
      readonly date: string;
      readonly notes: string;
      readonly installments: string;
      readonly installmentsOne: string;
      /** `{count}`: número de parcelas. */
      readonly installmentsMany: string;
      readonly lockedHint: string;
      readonly preview: {
        readonly title: string;
        readonly loading: string;
        /** `{month}` e `{date}`: fatura da compra. */
        readonly summaryOne: string;
        /** `{count}`, `{month}` e `{date}`: parcelas e fatura da 1ª. */
        readonly summaryMany: string;
        readonly list: string;
        /** `{number}` e `{total}`. */
        readonly installment: string;
        /** `{month}` e `{date}`. */
        readonly invoice: string;
        readonly total: string;
        readonly availableAfter: string;
        readonly unavailable: string;
        readonly warnings: {
          readonly OVER_LIMIT: string;
          readonly LATE_ENTRY: string;
          readonly LATE_ENTRY_HINT: string;
          readonly FUTURE_DATE: string;
        };
      };
    };
  };

  /** Pessoas (Etapa 4, T84). Saldos, datas e nomes vêm da API; aqui só rótulos. */
  abstract readonly people: {
    readonly loading: string;
    readonly tabsLabel: string;
    readonly active: string;
    readonly archivedTab: string;
    readonly add: string;
    readonly searchLabel: string;
    readonly searchPlaceholder: string;
    readonly emptySearch: string;
    readonly emptyArchived: string;
    readonly columns: {
      readonly name: string;
      readonly balance: string;
      readonly nextDue: string;
      readonly actions: string;
    };
    /** Frase do saldo, escolhida pelo sinal que o backend devolveu (`direction`). */
    readonly balance: {
      /** `{name}` e `{amount}`: "João deve R$ 150,00". */
      readonly RECEIVABLE: string;
      /** `{name}` e `{amount}`: "Você deve R$ 80,00 a João". */
      readonly PAYABLE: string;
      /** `{name}`: sem pendências. */
      readonly NONE: string;
    };
    /** `{count}`: dívidas em aberto. */
    readonly openDebtsOne: string;
    readonly openDebtsMany: string;
    readonly noOpenDebts: string;
    /** `{date}`: próxima cobrança. */
    readonly nextDue: string;
    readonly noNextDue: string;
    readonly row: {
      /** `{name}`: pessoa. */
      readonly open: string;
      readonly edit: string;
      readonly archive: string;
      readonly unarchive: string;
    };
    readonly archiveConfirm: {
      /** `{name}`: pessoa. */
      readonly title: string;
      readonly description: string;
      readonly confirm: string;
    };
    readonly toast: {
      /** `{name}`: pessoa. */
      readonly created: string;
      readonly updated: string;
      readonly archived: string;
      readonly unarchived: string;
    };
    readonly form: {
      readonly createTitle: string;
      readonly editTitle: string;
      readonly name: string;
      readonly notes: string;
      readonly optional: string;
      readonly homonym: string;
      readonly conflict: string;
      readonly reloadLatest: string;
      readonly save: string;
      readonly saving: string;
      readonly cancel: string;
      readonly notFound: EmptyStateCopy & { readonly back: string };
    };
    /** Escolher a pessoa (e criar uma nova) dentro de um formulário (S-138). */
    readonly picker: {
      readonly placeholder: string;
      readonly newPerson: string;
      readonly newName: string;
      readonly create: string;
      readonly creating: string;
      readonly cancelNew: string;
      readonly homonym: string;
      readonly noPeople: string;
    };
    readonly detail: {
      readonly loading: string;
      readonly actionsLabel: string;
      readonly archivedBanner: string;
      readonly archive: string;
      readonly unarchive: string;
      readonly edit: string;
      readonly lend: string;
      readonly receive: string;
      readonly newDebt: string;
      readonly tabsLabel: string;
      readonly owedToMe: string;
      readonly iOwe: string;
      readonly openSection: string;
      readonly closedSection: string;
      readonly emptyTab: string;
      readonly refreshFailed: string;
      readonly refreshRetry: string;
      readonly notFound: EmptyStateCopy & { readonly back: string };
    };
  };

  /** Dívidas, quitações, perdão e estorno (Etapa 4, T84/T85). Valores, status e datas vêm da API. */
  abstract readonly debts: {
    readonly status: Readonly<
      Record<'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'CANCELED' | 'VOIDED', string>
    >;
    readonly direction: Readonly<Record<'RECEIVABLE' | 'PAYABLE', string>>;
    readonly row: {
      readonly defaultTitleReceivable: string;
      readonly defaultTitlePayable: string;
      readonly principal: string;
      readonly settled: string;
      readonly outstanding: string;
      /** `{date}`: previsão. */
      readonly expected: string;
      readonly noDate: string;
      readonly overdue: string;
      /** `{title}`: dívida. */
      readonly open: string;
    };
    readonly detail: {
      readonly loading: string;
      readonly refreshFailed: string;
      readonly refreshRetry: string;
      readonly principal: string;
      readonly settled: string;
      readonly outstanding: string;
      readonly person: string;
      readonly creditor: string;
      readonly directionLabel: string;
      readonly date: string;
      readonly expectedDate: string;
      readonly noExpectedDate: string;
      readonly overdue: string;
      readonly description: string;
      readonly category: string;
      readonly origin: string;
      readonly originValues: Readonly<Record<'WITH_MOVEMENT' | 'WITHOUT_MOVEMENT', string>>;
      readonly viewOrigin: string;
      readonly closure: string;
      /** `{date}`: data do encerramento. */
      readonly closedOn: string;
      readonly closureReason: string;
      readonly settlements: {
        readonly title: string;
        readonly empty: string;
        readonly reversed: string;
        readonly view: string;
        /** `{amount}`: valor da quitação. */
        readonly reverse: string;
        readonly reverseTitle: string;
        readonly reverseDescription: string;
        readonly reverseConfirm: string;
        readonly reverseReason: string;
        readonly reverseToast: string;
      };
      readonly actions: {
        readonly settleReceivable: string;
        readonly settlePayable: string;
        readonly forgive: string;
        readonly void: string;
        readonly edit: string;
      };
      readonly voidBlocked: Readonly<
        Record<'DEBT_HAS_SETTLEMENTS' | 'DEBT_CLOSED' | 'HAS_ORIGIN_TRANSACTION', string>
      >;
      readonly notFound: EmptyStateCopy & { readonly back: string };
    };
    readonly settle: {
      readonly titleReceivable: string;
      readonly titlePayable: string;
      readonly description: string;
      readonly account: string;
      readonly amount: string;
      /** `{amount}`: saldo restante que o backend devolveu. */
      readonly amountHint: string;
      readonly date: string;
      readonly note: string;
      /** `{name}`: pessoa. */
      readonly defaultDescriptionReceivable: string;
      readonly defaultDescriptionPayable: string;
      readonly submit: string;
      readonly submitting: string;
      readonly retry: string;
      readonly cancel: string;
      readonly noAccounts: string;
      readonly addAccount: string;
      readonly toastReceivable: string;
      readonly toastPayable: string;
    };
    readonly forgive: {
      readonly title: string;
      readonly description: string;
      readonly reasonLabel: string;
      readonly confirm: string;
      readonly toast: string;
    };
    readonly void: {
      readonly title: string;
      readonly description: string;
      readonly reasonLabel: string;
      readonly confirm: string;
      readonly toast: string;
    };
    readonly edit: {
      readonly title: string;
      readonly description: string;
      readonly descriptionField: string;
      readonly expectedDate: string;
      readonly save: string;
      readonly saving: string;
      readonly cancel: string;
      readonly conflict: string;
      readonly toast: string;
    };
  };

  /** Emprestar, receber, nova dívida e divisão de despesa no `/quick-add` (Etapa 4, T85, T86). */
  abstract readonly lending: {
    readonly person: string;
    readonly expectedDate: string;
    readonly expectedDateHint: string;
    readonly noPeopleLoading: string;
    readonly loan: {
      readonly help: string;
      /** `{name}`: pessoa. */
      readonly defaultDescription: string;
      readonly description: string;
      /** `{amount}` e `{name}`: o valor e a pessoa como o backend devolveu. */
      readonly toast: string;
    };
    readonly received: {
      readonly help: string;
      readonly kind: string;
      readonly repayment: string;
      readonly borrowed: string;
      readonly debt: string;
      readonly debtPlaceholder: string;
      readonly noOpenDebts: string;
      /** `{name}`, `{title}` e `{amount}`: a dívida como o backend a devolveu (o saldo que falta). */
      readonly debtOption: string;
      /** `{amount}`: o que falta, devolvido pelo backend. */
      readonly amountHint: string;
      /** `{name}`: pessoa. */
      readonly defaultDescriptionRepayment: string;
      readonly defaultDescriptionBorrowed: string;
      readonly description: string;
      readonly toastRepayment: string;
      /** `{amount}` e `{name}`. */
      readonly toastBorrowed: string;
    };
    readonly debt: {
      readonly help: string;
      readonly noMovement: string;
      readonly direction: string;
      readonly amount: string;
      readonly date: string;
      readonly description: string;
      readonly category: string;
      readonly categoryHint: string;
      readonly categoryNone: string;
      readonly creditorLabel: string;
      readonly creditorPerson: string;
      readonly creditorOther: string;
      readonly creditorName: string;
      readonly creditorHint: string;
      readonly save: string;
      /** `{amount}` e `{name}`. */
      readonly toast: string;
    };
    readonly shares: {
      readonly toggle: string;
      readonly legend: string;
      /** `{number}`: posição da parte. */
      readonly row: string;
      readonly person: string;
      readonly amount: string;
      readonly add: string;
      /** `{name}`: pessoa da parte. */
      readonly remove: string;
      /** `{number}`: parte sem pessoa escolhida. */
      readonly removeUnnamed: string;
      readonly removeShort: string;
      readonly toast: string;
    };
  };

  /** Recorrências, custo fixo e ocorrências pendentes (Etapa 4, T87, T88). Valores e datas vêm da API. */
  abstract readonly recurrences: {
    readonly loading: string;
    readonly add: string;
    readonly tabsLabel: string;
    readonly tabs: {
      readonly recurrences: string;
      readonly pending: string;
      readonly summary: string;
      readonly projections: string;
      readonly debts: string;
      readonly thirdParties: string;
      readonly commitments: string;
      readonly overview: string;
    };
    /** Custo fixo e receita recorrente mensais: sempre rotulados como estimativa (S-146). */
    readonly summary: {
      readonly title: string;
      readonly fixedCosts: string;
      readonly recurringIncome: string;
      readonly estimate: string;
      readonly note: string;
      readonly loading: string;
      readonly error: string;
      readonly retry: string;
    };
    readonly types: Readonly<Record<'EXPENSE' | 'INCOME' | 'CARD_PURCHASE', string>>;
    readonly frequency: Readonly<
      Record<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM', string>
    >;
    readonly units: Readonly<Record<'DAYS' | 'WEEKS' | 'MONTHS', string>>;
    /** `{interval}` e `{unit}`: "A cada 2 semanas". */
    readonly every: string;
    readonly row: {
      /** `{date}`: próxima ocorrência pendente. */
      readonly next: string;
      readonly noNext: string;
      /** `{date}`: fim da recorrência. */
      readonly endsOn: string;
      readonly inactive: string;
      /** Encerrada (`ended`): sem ocorrência hoje nem depois; fora do custo fixo. */
      readonly ended: string;
      /** `{name}`: conta ou cartão. */
      readonly on: string;
      readonly monthly: string;
      readonly nextMonthIncome: string;
      readonly edit: string;
      readonly end: string;
      readonly deactivate: string;
      readonly actionsLabel: string;
      /** Recorrência sem conta definida (2.14.0). */
      readonly accountTbd: string;
    };
    readonly endSheet: {
      readonly title: string;
      readonly description: string;
      readonly date: string;
      readonly submit: string;
      readonly submitting: string;
      readonly cancel: string;
    };
    readonly deactivateConfirm: {
      /** `{name}`: recorrência. */
      readonly title: string;
      readonly description: string;
      readonly confirm: string;
    };
    readonly toast: {
      readonly created: string;
      readonly updated: string;
      readonly ended: string;
      readonly deactivated: string;
    };
    readonly form: {
      readonly createTitle: string;
      readonly editTitle: string;
      readonly type: string;
      readonly amount: string;
      readonly description: string;
      readonly category: string;
      readonly account: string;
      readonly method: string;
      readonly card: string;
      readonly cardNote: string;
      readonly accountTbd: string;
      readonly accountTbdHint: string;
      readonly frequency: string;
      readonly interval: string;
      readonly unit: string;
      /** `{count}`: valor do contador. */
      readonly intervalValue: string;
      readonly startDate: string;
      readonly endMode: string;
      readonly nextMonthIncome: string;
      readonly nextMonthIncomeHint: string;
      readonly endNone: string;
      readonly endDate: string;
      readonly endMax: string;
      readonly endDateField: string;
      readonly maxOccurrences: string;
      /** `{count}`: nº de ocorrências. */
      readonly maxValue: string;
      readonly locked: string;
      /** Como reabrir uma recorrência encerrada (S-236). */
      readonly endedHint: string;
      readonly save: string;
      readonly saving: string;
      readonly cancel: string;
      readonly conflict: string;
      readonly reloadLatest: string;
      readonly notFound: EmptyStateCopy & { readonly back: string };
      readonly noAccounts: EmptyStateCopy & { readonly action: string };
    };
    readonly occurrences: {
      readonly loading: string;
      readonly emptyTitle: string;
      readonly emptyDescription: string;
      readonly overdueSection: string;
      /** Havia mais de 500 vencidas: só as mais recentes aparecem (S-240). */
      readonly overdueTruncated: string;
      readonly upcomingSection: string;
      readonly viaAccount: string;
      readonly viaCard: string;
      readonly incoming: string;
      readonly accountTbd: string;
      readonly overdue: string;
      readonly realize: string;
      readonly skip: string;
      /** `{label}`: descrição da ocorrência. */
      readonly realizeLabel: string;
      readonly skipLabel: string;
      readonly skipConfirm: {
        readonly title: string;
        readonly description: string;
        readonly confirm: string;
      };
      readonly toastSkipped: string;
    };
    readonly realize: {
      /** `{label}`: descrição da ocorrência. */
      readonly title: string;
      readonly description: string;
      readonly date: string;
      readonly amount: string;
      readonly amountHint: string;
      readonly account: string;
      readonly method: string;
      readonly accountNote: string;
      readonly noAccounts: string;
      readonly cardNote: string;
      readonly submit: string;
      readonly submitting: string;
      readonly retry: string;
      readonly cancel: string;
      readonly toast: string;
      readonly viewInvoice: string;
    };
  };

  /** Metas (T100): reserva lógica; tudo calculado pelo backend, a UI só exibe. */
  abstract readonly goals: {
    readonly loading: string;
    readonly add: string;
    readonly tabsLabel: string;
    readonly tabs: {
      readonly active: string;
      readonly achieved: string;
      readonly archived: string;
    };
    readonly emptyAchieved: string;
    readonly emptyArchived: string;
    readonly addSmart: string;
    readonly metricTag: string;
    readonly metric: Readonly<
      Record<
        | 'TOTAL_DEBT'
        | 'CARD_DEBT'
        | 'PEOPLE_DEBT'
        | 'OTHER_DEBT'
        | 'ACCOUNTS_BALANCE'
        | 'AVAILABLE_BALANCE'
        | 'FIXED_COSTS_MONTHLY',
        string
      >
    >;
    readonly metricFallback: string;
    readonly generatedName: string;
    readonly archivedMetric: string;
    readonly direction: Readonly<Record<'DECREASE' | 'INCREASE', string>>;
    readonly stage: Readonly<
      Record<'FANTASY' | 'OBJECTIVE' | 'STRATEGY' | 'CONSISTENT' | 'ACHIEVED', string>
    >;
    readonly stageDescription: Readonly<
      Record<'FANTASY' | 'OBJECTIVE' | 'STRATEGY' | 'CONSISTENT' | 'ACHIEVED', string>
    >;
    readonly stageHint: Readonly<
      Record<'FANTASY' | 'OBJECTIVE' | 'STRATEGY' | 'CONSISTENT' | 'ACHIEVED', string>
    >;
    readonly stageBadge: string;
    readonly ladder: {
      readonly title: string;
      readonly intro: string;
      readonly here: string;
      readonly done: string;
      readonly todo: string;
      readonly next: string;
    };
    readonly smart: {
      readonly createTitle: string;
      readonly intro: string;
      readonly metric: string;
      readonly metricPlaceholder: string;
      readonly currentLabel: string;
      readonly currentLoading: string;
      readonly currentError: string;
      readonly retry: string;
      readonly target: string;
      readonly targetHint: string;
      readonly deadline: string;
      readonly noDeadlineWarning: string;
      readonly name: string;
      readonly save: string;
      readonly saving: string;
      readonly cancel: string;
    };
    readonly metricDetail: {
      readonly currentLabel: string;
      readonly targetLabel: string;
      readonly baselineLabel: string;
      readonly remainingLabel: string;
      readonly note: string;
    };
    readonly plan: {
      readonly title: string;
      readonly suggestionTitle: string;
      readonly suggestion: string;
      readonly suggestionNote: string;
      readonly noPace: string;
      readonly overdue: string;
      readonly reachedNote: string;
      readonly monthsLeft: string;
      readonly milestone: string;
      readonly status: string;
      readonly onTrack: string;
      readonly behind: string;
      readonly noteLabel: string;
      readonly noteHint: string;
      readonly noteSave: string;
      readonly noteSaving: string;
      readonly actionsTitle: string;
      readonly actionsHint: string;
      readonly actionsEmpty: string;
      readonly actionTitle: string;
      readonly actionFrequency: string;
      readonly frequency: {
        readonly MONTHLY: string;
        readonly WEEKLY: string;
        readonly ONE_TIME: string;
      };
      readonly edit: string;
      readonly remove: string;
      readonly addAction: string;
      readonly addTitle: string;
      readonly editTitle: string;
      readonly saveAction: string;
      readonly savingAction: string;
      readonly cancel: string;
      readonly editAction: string;
      readonly removeAction: string;
      readonly limit: string;
      readonly checkIn: {
        readonly MONTHLY: string;
        readonly WEEKLY: string;
        readonly ONE_TIME: string;
      };
      readonly checkInAria: string;
      readonly doneIn: string;
      readonly noneDone: string;
      readonly period: {
        readonly week: string;
        readonly once: string;
      };
      readonly removeConfirm: {
        readonly title: string;
        readonly description: string;
        readonly confirm: string;
      };
      readonly toast: {
        readonly noteSaved: string;
        readonly added: string;
        readonly updated: string;
        readonly removed: string;
      };
    };
    readonly consistency: {
      readonly title: string;
      readonly description: string;
      readonly timelineLabel: string;
      readonly streak: string;
      readonly rate: string;
      readonly noRate: string;
      readonly expected: string;
      readonly actual: string;
      readonly met: string;
      readonly notMet: string;
      readonly noData: string;
      readonly inProgress: string;
      readonly empty: string;
      readonly note: string;
    };
    readonly status: Readonly<Record<'ACTIVE' | 'ACHIEVED' | 'ARCHIVED', string>>;
    readonly priority: Readonly<Record<'HIGH' | 'MEDIUM' | 'LOW', string>>;
    /** `{priority}`. */
    readonly priorityTag: string;
    readonly card: {
      /** `{name}`. */
      readonly open: string;
      /** `{name}`: nome acessível da barra. */
      readonly progressLabel: string;
      /** `{current}` e `{target}`. */
      readonly progressText: string;
      readonly percentLabel: string;
      readonly currentLabel: string;
      readonly remainingLabel: string;
      /** `{date}`. */
      readonly deadline: string;
      readonly noDeadline: string;
      readonly monthlyLabel: string;
      readonly estimate: string;
      readonly estimateNote: string;
      readonly achieved: string;
    };
    readonly uncovered: { readonly title: string; readonly description: string };
    readonly detail: {
      readonly reserve: string;
      readonly release: string;
      readonly edit: string;
      readonly archive: string;
      readonly unarchive: string;
      readonly back: string;
      readonly reservations: string;
      readonly noReservations: string;
      readonly reservationTag: string;
      readonly releaseTag: string;
      /** `{account}`. */
      readonly onAccount: string;
      readonly notMoney: string;
      readonly archivedNote: string;
      readonly achievedTitle: string;
      readonly achievedDescription: string;
      readonly notFound: {
        readonly title: string;
        readonly description: string;
        readonly back: string;
      };
    };
    /** Meta "quitar todas as dívidas" (`DEBT_PAYOFF`, 2.13.0). */
    readonly payoff: {
      readonly add: string;
      readonly created: string;
      readonly creating: string;
      readonly exists: string;
      readonly tag: string;
      readonly building: string;
      readonly buildingCard: string;
      readonly stepsTitle: string;
      readonly steps: string;
      readonly confirm: string;
      readonly confirming: string;
      readonly viewDebts: string;
      readonly baselineToast: string;
      readonly baselineLabel: string;
      readonly paidLabel: string;
      readonly achievedDescription: string;
      readonly remainingLabel: string;
      readonly progressNote: string;
      readonly grewTitle: string;
      readonly grewDescription: string;
      readonly reanchor: string;
      readonly reanchorConfirm: {
        readonly title: string;
        readonly description: string;
        readonly confirm: string;
      };
    };
    readonly archiveConfirm: {
      /** `{name}`. */
      readonly title: string;
      readonly description: string;
      readonly confirm: string;
    };
    readonly form: {
      readonly nameOptional: string;
      readonly createTitle: string;
      readonly editTitle: string;
      readonly name: string;
      readonly target: string;
      readonly deadline: string;
      readonly priority: string;
      readonly moreOptions: string;
      readonly description: string;
      readonly save: string;
      readonly saving: string;
      readonly cancel: string;
      readonly conflict: string;
      readonly reloadLatest: string;
      /** Conflito de versão: atualiza só a versão e mantém o digitado (FE-S-170). */
      readonly keepTyped: string;
    };
    readonly photos: {
      readonly title: string;
      readonly hint: string;
      readonly add: string;
      /** `{count}`, `{max}`. */
      readonly counter: string;
      readonly counterLabel: string;
      /** `{max}`. */
      readonly full: string;
      readonly empty: string;
      readonly editNote: string;
      readonly createNote: string;
      readonly cover: string;
      readonly makeCover: string;
      readonly moveLeft: string;
      readonly moveRight: string;
      readonly remove: string;
      readonly cancel: string;
      readonly retry: string;
      readonly retryAll: string;
      readonly waiting: string;
      /** `{percent}`. */
      readonly uploading: string;
      readonly failed: string;
      /** `{n}`, `{total}`, `{name}`. */
      readonly alt: string;
      /** `{n}`, `{file}`. */
      readonly queuedAlt: string;
      /** `{position}`, `{total}`. */
      readonly moved: string;
      readonly loading: string;
      readonly unavailable: string;
      readonly reloadPhoto: string;
      readonly removeConfirm: {
        readonly title: string;
        readonly description: string;
        readonly confirm: string;
      };
      /** `{name}`, `{max}`. */
      readonly rejected: {
        readonly type: string;
        readonly size: string;
        readonly empty: string;
        readonly limit: string;
      };
      readonly someFailed: string;
      readonly finish: string;
      readonly featured: {
        readonly label: string;
        readonly hint: string;
        readonly on: string;
        readonly off: string;
      };
      readonly gallery: {
        /** `{name}`. */
        readonly label: string;
        readonly previous: string;
        readonly next: string;
        readonly thumbs: string;
        /** `{n}`. */
        readonly show: string;
        readonly empty: string;
        readonly add: string;
      };
    };
    readonly reserve: {
      /** `{name}`. */
      readonly reserveTitle: string;
      /** `{name}`. */
      readonly releaseTitle: string;
      readonly description: string;
      readonly kind: string;
      readonly account: string;
      readonly amount: string;
      readonly date: string;
      readonly note: string;
      readonly submitReserve: string;
      readonly submitRelease: string;
      readonly submitting: string;
      readonly retry: string;
      readonly cancel: string;
      readonly noAccounts: string;
      readonly addAccount: string;
      readonly accountsError: string;
      readonly pickGoal: string;
    };
    readonly toast: {
      readonly created: string;
      readonly updated: string;
      readonly reserved: string;
      readonly released: string;
      readonly archived: string;
      readonly unarchived: string;
    };
  };

  /** Resumo mensal (T102): tudo vem do backend; "Analisar com IA" fica desligado até a IA existir. */
  abstract readonly summary: {
    readonly loading: string;
    /** `{month}`: "outubro de 2026". */
    readonly title: string;
    readonly monthPicker: string;
    readonly partial: string;
    readonly partialNote: string;
    readonly projection: string;
    readonly invalidMonth: {
      readonly title: string;
      readonly description: string;
      readonly action: string;
    };
    readonly income: string;
    readonly expenses: string;
    readonly expensesNote: string;
    readonly investments: string;
    readonly investmentsNote: string;
    readonly net: string;
    readonly savingsRate: string;
    readonly savingsRateEmpty: string;
    readonly largestCategory: string;
    readonly largestExpense: string;
    readonly installment: string;
    readonly openTransaction: string;
    readonly openDebt: string;
    readonly none: string;
    readonly card: string;
    readonly cardConsumption: string;
    readonly cardOutstanding: string;
    readonly futureInstallments: string;
    readonly futureInstallmentsNote: string;
    readonly comparison: {
      /** `{month}`. */
      readonly title: string;
      readonly partialNote: string;
      readonly noBase: string;
      /** `{amount}` e `{percent}`. */
      readonly up: string;
      readonly down: string;
      readonly same: string;
      /** `{amount}`: sem percentual (base zero). */
      readonly upNoPercent: string;
      readonly downNoPercent: string;
    };
    readonly analyzeOff: string;
  };

  /** Projeções (T103): sempre "projeção, não certeza". */
  abstract readonly projections: {
    readonly loading: string;
    readonly horizonLabel: string;
    readonly horizons: Readonly<Record<'D30' | 'D90' | 'M6' | 'M12', string>>;
    readonly bannerTitle: string;
    readonly bannerText: string;
    readonly assumptionsTitle: string;
    readonly assumptions: Readonly<Record<string, string>>;
    readonly assumptionUnknown: string;
    readonly startingBalance: string;
    readonly chartLabel: string;
    readonly table: {
      readonly caption: string;
      readonly month: string;
      readonly inflows: string;
      readonly outflows: string;
      readonly balance: string;
      /** `{date}`: o último ponto termina no fim do horizonte. */
      readonly partialUntil: string;
    };
    readonly trend: {
      readonly toggle: string;
      readonly hint: string;
      readonly title: string;
      readonly estimate: string;
      readonly monthlyAverage: string;
      /** `{months}`. */
      readonly basedOn: string;
      readonly spending: string;
      readonly balance: string;
      readonly unavailable: string;
      readonly reasons: Readonly<Record<string, string>>;
    };
    readonly goals: { readonly title: string; readonly note: string; readonly reserved: string };
    readonly empty: {
      readonly title: string;
      readonly description: string;
      readonly action: string;
    };
  };

  /** Exportar (T104): CSV e backup por download autenticado. */
  abstract readonly exports: {
    readonly title: string;
    readonly description: string;
    readonly csv: {
      readonly title: string;
      readonly description: string;
      readonly from: string;
      readonly to: string;
      readonly rangeHint: string;
      readonly rangeInvalid: string;
      readonly action: string;
      readonly running: string;
      /** Idioma sem cabeçalho de CSV próprio no backend (M1, FE-S-167). */
      readonly headerFallback: string;
    };
    readonly backup: {
      readonly title: string;
      readonly description: string;
      readonly privacy: string;
      readonly action: string;
      readonly running: string;
    };
    /** `{name}`: o download foi iniciado (a ação final do "Salvar"). */
    readonly saved: string;
    /** `{name}`: o usuário concluiu o compartilhamento. */
    readonly shared: string;
    /** Estado "Arquivo pronto": o arquivo já está em memória e a ação final é do usuário (gesto). */
    readonly ready: {
      readonly title: string;
      /** `{name}`. */
      readonly hint: string;
      readonly save: string;
      readonly dismiss: string;
    };
    readonly share: string;
    /** `{seconds}`: espera do `Retry-After` (429) antes de liberar "tentar de novo". */
    readonly retryIn: string;
    readonly retry: string;
  };

  /** Vault de notas Markdown (Etapa 6): lista, editor, vínculos, notas nas telas financeiras, importar e exportar. */
  abstract readonly notes: {
    /** Armazenamento honesto (S-157): as notas moram no servidor, não no aparelho. */
    readonly storage: string;
    readonly editorStorage: string;
    readonly list: {
      readonly loading: string;
      readonly newNote: string;
      readonly searchLabel: string;
      readonly searchPlaceholder: string;
      readonly viewLabel: string;
      readonly viewNotes: string;
      readonly viewTrash: string;
      readonly tagsLabel: string;
      readonly foldersLabel: string;
      readonly treeLabel: string;
      /** `{count}`: a árvore de pastas cobre só parte das notas. */
      readonly treePartial: string;
      readonly treeLoadMore: string;
      /** `{count}`: passou do limite; a árvore fica parcial. */
      readonly treeCapped: string;
      readonly allNotes: string;
      readonly folderSelectLabel: string;
      /** `{name}` e `{count}`: nome acessível do item da árvore. */
      readonly folderItem: string;
      readonly clearFilters: string;
      readonly noResults: EmptyStateCopy;
      readonly loadMore: string;
      readonly loadingMore: string;
      /** `{date}`. */
      readonly updated: string;
      /** `{count}`: resultados anunciados depois de uma busca. */
      readonly resultsCount: string;
      readonly resultsNone: string;
    };
    readonly trash: {
      readonly title: string;
      readonly description: string;
      readonly empty: string;
      readonly restore: string;
      /** `{title}`. */
      readonly restoreNamed: string;
      readonly emptyTrash: string;
      readonly emptyConfirm: {
        readonly title: string;
        readonly description: string;
        readonly confirm: string;
      };
      readonly restored: string;
      readonly emptied: string;
      /** `{date}`. */
      readonly trashedAt: string;
    };
    readonly create: {
      readonly title: string;
      readonly description: string;
      readonly nameLabel: string;
      readonly nameHint: string;
      readonly folderLabel: string;
      readonly folderHint: string;
      readonly submit: string;
      readonly submitting: string;
      readonly cancel: string;
      readonly nameRequired: string;
      readonly pathInvalid: string;
      readonly pathTooLong: string;
      readonly pathTooDeep: string;
      /** `{name}`: sugestão de nome para a nota vinculada a uma entidade. */
      readonly suggestion: string;
      readonly created: string;
    };
    readonly editor: {
      readonly back: string;
      readonly loading: string;
      readonly notFound: {
        readonly title: string;
        readonly description: string;
        readonly back: string;
      };
      readonly modeLabel: string;
      readonly write: string;
      readonly read: string;
      readonly textLabel: string;
      /** `{save}`, `{bold}`, `{italic}`, `{link}`: atalhos já escritos para a plataforma. */
      readonly keyboardHelp: string;
      readonly save: string;
      readonly saving: string;
      readonly saved: string;
      readonly unsaved: string;
      readonly savedToast: string;
      /** Rascunho local restaurado depois de a aba ser recarregada ou descartada pelo sistema. */
      readonly draftRecovered: string;
      readonly draftDiscard: string;
      /** `{used}` e `{max}`: tamanho do texto. */
      readonly size: string;
      readonly tooLarge: string;
      readonly toolbarLabel: string;
      readonly bold: string;
      readonly italic: string;
      readonly linkTool: string;
      readonly wikilinkTool: string;
      readonly listTool: string;
      readonly quoteTool: string;
      readonly codeTool: string;
      readonly previewLabel: string;
      readonly previewEmpty: string;
      readonly tagsLabel: string;
      readonly tagsEmpty: string;
      /** `{date}`. */
      readonly updated: string;
      readonly moreActions: string;
      readonly rename: string;
      readonly moveToTrash: string;
      readonly leave: {
        readonly title: string;
        readonly description: string;
        readonly confirm: string;
        readonly stay: string;
      };
      readonly trashed: string;
      readonly restore: string;
      readonly trashConfirm: {
        readonly title: string;
        readonly description: string;
        readonly dirty: string;
        readonly confirm: string;
      };
      readonly trashedToast: string;
      readonly restoredToast: string;
      readonly move: {
        readonly title: string;
        readonly description: string;
        readonly pathLabel: string;
        readonly pathHint: string;
        readonly saveFirst: string;
        readonly submit: string;
        readonly submitting: string;
        readonly cancel: string;
        readonly pathInvalid: string;
        readonly moved: string;
        readonly rewrittenNone: string;
        readonly rewrittenOne: string;
        /** `{count}`. */
        readonly rewrittenMany: string;
        readonly dismiss: string;
      };
      readonly conflict: {
        readonly title: string;
        readonly description: string;
        /** Conflito ao renomear/mover: a mudança não foi aplicada. */
        readonly descriptionMove: string;
        /** Conflito ao vincular: a mudança não foi aplicada. */
        readonly descriptionLinks: string;
        readonly viewDiff: string;
        readonly hideDiff: string;
        readonly keepMine: string;
        readonly useRemote: string;
        readonly diffLabel: string;
        readonly diffAdded: string;
        readonly diffRemoved: string;
        readonly diffSame: string;
        readonly diffTooBig: string;
        readonly diffShowMore: string;
        /** `{shown}` de `{total}` linhas. */
        readonly diffCount: string;
        readonly remoteVersion: string;
        readonly remoteLoadFailed: string;
      };
    };
    readonly links: {
      readonly title: string;
      readonly linkedTo: string;
      readonly none: string;
      readonly add: string;
      readonly remove: string;
      /** `{name}`. */
      readonly removeNamed: string;
      readonly open: string;
      readonly pending: string;
      readonly pendingHint: string;
      readonly createNote: string;
      readonly types: Readonly<
        Record<
          | 'TRANSACTION'
          | 'ACCOUNT'
          | 'CARD'
          | 'INVOICE'
          | 'PERSON'
          | 'DEBT'
          | 'GOAL'
          | 'MONTHLY_SUMMARY'
          | 'NOTE',
          string
        >
      >;
      readonly status: Readonly<Record<'VOIDED' | 'ARCHIVED' | 'CANCELED' | 'TRASHED', string>>;
      readonly inText: string;
      readonly inTextNone: string;
      readonly backlinks: string;
      readonly backlinksNone: string;
      readonly backlinksError: string;
      readonly backlinksRetry: string;
      readonly saved: string;
      /** Vínculos pendentes (de uma importação) saem quando os vínculos são trocados. */
      readonly pendingDropHint: string;
    };
    readonly picker: {
      readonly title: string;
      readonly description: string;
      readonly typeLabel: string;
      readonly searchLabel: string;
      readonly searchPlaceholder: string;
      readonly monthLabel: string;
      readonly cardLabel: string;
      readonly resultsLabel: string;
      readonly loading: string;
      readonly noResults: string;
      readonly error: string;
      readonly retry: string;
      /** `{count}`: resultados anunciados. */
      readonly resultsCount: string;
      readonly add: string;
      readonly cancel: string;
      readonly alreadyLinked: string;
      readonly chooseCardFirst: string;
      readonly noInvoices: string;
      /** `{month}`: competência da fatura. */
      readonly invoiceLabel: string;
    };
    readonly linked: {
      readonly title: string;
      readonly monthlyTitle: string;
      readonly loading: string;
      readonly empty: string;
      readonly newNote: string;
      readonly loadMore: string;
      readonly createTitle: string;
      readonly createDescription: string;
      readonly note: string;
    };
    readonly vault: {
      readonly title: string;
      readonly description: string;
      readonly export: {
        readonly title: string;
        readonly description: string;
        readonly action: string;
        readonly running: string;
        readonly ready: string;
        /** `{name}`. */
        readonly saved: string;
        readonly retry: string;
        /** `{seconds}`: espera do `Retry-After` (429). */
        readonly retryIn: string;
      };
      readonly import: {
        readonly title: string;
        readonly description: string;
        readonly fileLabel: string;
        readonly fileHint: string;
        readonly modeLabel: string;
        readonly skip: string;
        readonly skipHint: string;
        readonly rename: string;
        readonly renameHint: string;
        readonly action: string;
        readonly running: string;
        readonly retry: string;
        /** Falha sem resposta em `RENAME`: o resultado é incerto e repetir pode duplicar as notas. */
        readonly uncertain: string;
        readonly reset: string;
        readonly confirm: {
          readonly title: string;
          readonly skip: string;
          readonly rename: string;
          readonly confirm: string;
        };
      };
      readonly report: {
        readonly title: string;
        readonly review: string;
        readonly created: string;
        readonly skipped: string;
        readonly pending: string;
        readonly ignored: string;
        readonly renamed: string;
        readonly warnings: string;
        readonly skippedFiles: string;
        readonly ignoredFiles: string;
        readonly renamedFiles: string;
        /** `{from}` e `{to}`. */
        readonly renamedItem: string;
        readonly warningOther: string;
        readonly warningCodes: Readonly<Record<string, string>>;
        readonly done: string;
        readonly openNotes: string;
        /** `{count}`: itens que não cabem na lista exibida. */
        readonly more: string;
      };
    };
    readonly markdown: {
      /** `{alt}`. */
      readonly imageBlocked: string;
      readonly imageBlockedNoAlt: string;
      readonly wikilinkPending: string;
      readonly wikilinkPendingHint: string;
      readonly embedNote: string;
      readonly externalLink: string;
      readonly taskDone: string;
      readonly taskOpen: string;
      /** A pré-visualização foi cortada por ser grande demais. */
      readonly truncated: string;
      /** Markdown grande ou complexo demais para formatar: a nota aparece como texto simples. */
      readonly tooComplex: string;
    };
  };

  /** Importar extrato (Etapa 7): envio, mapeamento de colunas, revisão linha a linha, aplicar e desfazer. */
  abstract readonly imports: {
    readonly intro: string;
    readonly formats: string;
    readonly unsupported: string;
    readonly privacy: string;
    readonly newImport: string;
    readonly upload: {
      readonly title: string;
      readonly sourceKind: string;
      readonly kindAccount: string;
      readonly kindCard: string;
      readonly account: string;
      readonly card: string;
      readonly noAccounts: string;
      readonly noCards: string;
      readonly file: string;
      readonly fileHint: string;
      readonly send: string;
      readonly sending: string;
      /** `{percent}`. */
      readonly progress: string;
      readonly cancel: string;
      readonly cancelled: string;
      readonly retry: string;
      readonly nothingCreated: string;
      readonly chooseSource: string;
      readonly chooseFile: string;
    };
    readonly mapping: {
      readonly title: string;
      readonly description: string;
      readonly saved: string;
      readonly noPreview: string;
      readonly csvOnly: string;
      readonly useMapping: string;
      readonly columnHint: string;
      readonly date: string;
      readonly descriptionColumn: string;
      readonly valueMode: string;
      readonly oneColumn: string;
      readonly twoColumns: string;
      readonly amount: string;
      readonly debit: string;
      readonly credit: string;
      readonly invert: string;
      readonly invertHint: string;
      readonly hasHeader: string;
      readonly delimiter: string;
      readonly delimiterAuto: string;
      readonly delimiterSemicolon: string;
      readonly delimiterComma: string;
      readonly delimiterTab: string;
      readonly invalid: string;
    };
    readonly recent: {
      readonly title: string;
      readonly loading: string;
      readonly empty: string;
      readonly open: string;
      /** `{count}`. */
      readonly lines: string;
      /** `{date}`. */
      readonly createdOn: string;
      readonly target: string;
    };
    readonly batchStatus: Readonly<
      Record<'PENDING_REVIEW' | 'APPLIED' | 'UNDONE' | 'PARTIALLY_UNDONE', string>
    >;
    readonly lineStatus: Readonly<
      Record<'PENDING' | 'ACCEPTED' | 'DUPLICATE' | 'POSSIBLE_DUPLICATE' | 'REJECTED', string>
    >;
    readonly flags: Readonly<
      Record<
        | 'LOOKS_LIKE_INVOICE_PAYMENT'
        | 'CARD_CREDIT_NOT_IMPORTED'
        | 'LOOKS_LIKE_INSTALLMENT'
        | 'POSSIBLE_TRANSFER',
        string
      >
    >;
    readonly flagHelp: Readonly<
      Record<
        | 'LOOKS_LIKE_INVOICE_PAYMENT'
        | 'CARD_CREDIT_NOT_IMPORTED'
        | 'LOOKS_LIKE_INSTALLMENT'
        | 'POSSIBLE_TRANSFER',
        string
      >
    >;
    readonly warnings: {
      readonly SAME_FILE_ALREADY_IMPORTED: string;
      readonly STATEMENT_KIND_MISMATCH: string;
      readonly other: string;
      readonly seeImports: string;
    };
    readonly review: {
      readonly title: string;
      readonly reviewFirst: string;
      readonly loading: string;
      readonly empty: string;
      readonly notFound: string;
      readonly back: string;
      readonly tableLabel: string;
      readonly date: string;
      readonly description: string;
      readonly amount: string;
      readonly category: string;
      readonly method: string;
      readonly status: string;
      readonly actions: string;
      readonly in: string;
      readonly out: string;
      readonly noCategory: string;
      readonly confidenceHigh: string;
      readonly confidenceMedium: string;
      readonly suggested: string;
      readonly filterStatus: string;
      readonly filterFlag: string;
      readonly allStatuses: string;
      readonly allFlags: string;
      readonly accept: string;
      readonly reject: string;
      readonly force: string;
      readonly decide: string;
      readonly edit: string;
      readonly sameLaunch: string;
      readonly otherLaunch: string;
      readonly similar: string;
      readonly viewSimilar: string;
      readonly loadMore: string;
      readonly loadingMore: string;
      /** `{accepted}`, `{rejected}`, `{decide}`. */
      readonly summary: string;
      readonly acceptAll: string;
      /** `{updated}`. */
      readonly bulkDone: string;
      /** `{count}`. */
      readonly bulkSkipped: string;
      readonly skipReasons: Readonly<
        Record<
          | 'LINE_NOT_FOUND'
          | 'REQUIRES_DECISION'
          | 'NOT_PENDING'
          | 'NO_CATEGORY'
          | 'INVALID_TRANSITION',
          string
        >
      >;
      /** `{count}`. */
      readonly needsDecision: string;
      readonly apply: string;
      readonly applying: string;
      readonly applyConfirm: {
        readonly title: string;
        /** `{accepted}`. */
        readonly description: string;
        readonly confirm: string;
      };
      /** `{created}`. */
      readonly applied: string;
      readonly seeTransactions: string;
      readonly undo: string;
      readonly undoing: string;
      readonly undoConfirm: {
        readonly title: string;
        readonly description: string;
        readonly reason: string;
        readonly confirm: string;
      };
      readonly undone: string;
      readonly partiallyUndone: string;
      readonly partiallyUndoneHelp: string;
      readonly blockedTitle: string;
      readonly shortcuts: {
        readonly title: string;
        readonly move: string;
        readonly accept: string;
        readonly reject: string;
        readonly category: string;
      };
      readonly rowLabel: string;
      readonly reopen: string;
      readonly discard: string;
      readonly discarding: string;
      readonly discardConfirm: {
        readonly title: string;
        readonly description: string;
        readonly confirm: string;
      };
      readonly legConflict: {
        readonly message: string;
        readonly acceptAsIs: string;
        readonly reject: string;
      };
      readonly applyFailed: {
        readonly withLine: string;
        readonly withoutLine: string;
        readonly alreadyRecorded: string;
        readonly legAlreadyRecorded: string;
        readonly other: string;
        readonly rejectLine: string;
        readonly discardBatch: string;
      };
      readonly readonlyNote: string;
      readonly skippedLines: string;
    };
    readonly decision: {
      readonly title: string;
      readonly line: string;
      readonly transferTitle: string;
      readonly transferHelp: string;
      readonly isTransfer: string;
      readonly isEntry: string;
      readonly counterpartAccount: string;
      readonly installmentTitle: string;
      readonly installmentHelp: string;
      readonly installmentSingle: string;
      readonly installmentIgnore: string;
      readonly category: string;
      readonly method: string;
      readonly noMethod: string;
      readonly editedDescription: string;
      readonly learn: string;
      readonly learnHint: string;
      readonly confirm: string;
      readonly confirmForce: string;
      readonly cancel: string;
      readonly forceHelp: string;
      readonly categoryRequired: string;
      readonly counterpartRequired: string;
    };
  };

  /** Notificações, lembretes, configurações de aviso e push (Etapa 7). */
  abstract readonly notifications: {
    readonly popover: {
      readonly title: string;
      readonly empty: string;
      readonly error: string;
      readonly retry: string;
      readonly viewAll: string;
    };
    readonly bell: {
      readonly label: string;
      readonly one: string;
      /** `{count}`. */
      readonly many: string;
    };
    readonly center: {
      readonly subtitle: string;
      readonly loading: string;
      readonly emptyTitle: string;
      readonly emptyDescription: string;
      readonly filterStatus: string;
      readonly all: string;
      readonly unread: string;
      readonly filterKind: string;
      readonly allKinds: string;
      readonly markRead: string;
      readonly markAllRead: string;
      readonly open: string;
      readonly unreadMark: string;
      readonly loadMore: string;
      readonly offline: string;
      readonly newAnnounce: string;
      readonly settingsLink: string;
      readonly listLabel: string;
    };
    readonly kinds: Readonly<
      Record<
        | 'INVOICE_DUE'
        | 'DEBT_COLLECT'
        | 'DEBT_PAYABLE_DUE'
        | 'RECURRENCE_PENDING'
        | 'COMMITTED_NEXT_MONTH'
        | 'DAILY_SUMMARY'
        | 'REMINDER'
        | 'GOAL_DEADLINE'
        | 'GROUPED',
        string
      >
    >;
    /** Texto por chave de i18n do backend (`titleKey`); o corpo é a chave + `.body`. */
    readonly messages: Readonly<Record<string, { readonly title: string; readonly body: string }>>;
    readonly unknownMessage: { readonly title: string; readonly body: string };
    readonly daily: {
      readonly greeting: string;
      /** `{name}`. */
      readonly greetingNamed: string;
      /** `{available}`, `{committed7d}`. */
      readonly summary: string;
      /** `{goalName}`, `{goalProgress}`. */
      readonly goal: string;
    };
    readonly reminders: {
      readonly title: string;
      readonly add: string;
      readonly edit: string;
      readonly loading: string;
      readonly emptyTitle: string;
      readonly emptyDescription: string;
      readonly done: string;
      readonly doneBadge: string;
      readonly snooze: string;
      readonly showDone: string;
      /** `{date}`. */
      readonly on: string;
      /** `{date}`, `{time}`. */
      readonly onAt: string;
      readonly form: {
        readonly addTitle: string;
        readonly editTitle: string;
        readonly title: string;
        readonly date: string;
        readonly time: string;
        readonly timeHint: string;
        readonly note: string;
        readonly save: string;
        readonly cancel: string;
        readonly timeInvalid: string;
      };
    };
    readonly settings: {
      readonly title: string;
      readonly description: string;
      readonly loading: string;
      readonly dailyTitle: string;
      readonly dailyEnabled: string;
      readonly dailyTime: string;
      readonly timeHint: string;
      readonly frequency: string;
      readonly frequencies: Readonly<Record<'DAILY' | 'ONLY_DUE' | 'OFF', string>>;
      readonly kindsTitle: string;
      readonly kindsLabels: Readonly<
        Record<
          | 'INVOICE_DUE'
          | 'DEBT_COLLECT'
          | 'DEBT_PAYABLE_DUE'
          | 'RECURRENCE_PENDING'
          | 'COMMITTED_NEXT_MONTH'
          | 'GOAL_DEADLINE',
          string
        >
      >;
      readonly quietTitle: string;
      readonly quietFrom: string;
      readonly quietTo: string;
      readonly displayName: string;
      readonly displayNameHint: string;
      readonly save: string;
      readonly saving: string;
      readonly saved: string;
      readonly timeInvalid: string;
      readonly conflict: string;
      readonly back: string;
      readonly push: {
        readonly title: string;
        readonly loading: string;
        readonly enable: string;
        readonly disable: string;
        readonly working: string;
        readonly active: string;
        readonly ready: string;
        readonly serverOff: string;
        readonly unsupported: string;
        readonly iosNeedsInstall: string;
        readonly denied: string;
        readonly error: string;
      };
    };
  };

  /** Visão total de dívidas, parcelado em andamento e cartão do Início (2.13.0). Valores vêm da API. */
  abstract readonly debtOverview: {
    /** Compromissos acompanhados (2.14.0): bloco à parte, fora do total. */
    readonly tracked: {
      readonly title: string;
      readonly description: string;
      readonly empty: string;
      readonly manage: string;
      readonly add: string;
      /** `{paid}` e `{total}`. */
      readonly installments: string;
      readonly balanceUnknown: string;
      /** `{percent}`. */
      readonly progress: string;
      /** `{date}`. */
      readonly nextDue: string;
      readonly paid: string;
      readonly balance: string;
      readonly directPending: string;
      readonly scheduleTitle: string;
      readonly scheduleNote: string;
      readonly kinds: Readonly<Record<'TRACKED_THIRD_PARTY' | 'LONG_TERM_PROJECT', string>>;
    };
    readonly title: string;
    readonly description: string;
    readonly loading: string;
    readonly refreshing: string;
    readonly total: {
      readonly label: string;
      readonly asOf: string;
      readonly note: string;
    };
    readonly parts: {
      readonly cards: string;
      readonly people: string;
      readonly other: string;
    };
    readonly empty: {
      readonly title: string;
      readonly description: string;
      readonly addOngoing: string;
      readonly addDebt: string;
    };
    readonly none: {
      readonly title: string;
      readonly description: string;
    };
    readonly actions: {
      readonly addOngoing: string;
      readonly addDebt: string;
    };
    readonly comparison: {
      readonly title: string;
      readonly incomeBase: string;
      readonly incomeSource: Readonly<
        Record<'RECURRING_ESTIMATE' | 'LAST_FULL_MONTH' | 'NONE', string>
      >;
      readonly debtToIncome: string;
      readonly fixedCostToIncome: string;
      readonly debtMinusInAccounts: string;
      readonly inAccounts: string;
      readonly noIncome: string;
    };
    readonly cards: {
      readonly title: string;
      readonly invoiced: string;
      readonly future: string;
      readonly otherCharges: string;
      readonly adjustment: string;
      readonly plans: string;
      readonly noPlans: string;
      readonly empty: string;
      readonly remainingText: string;
      readonly installmentText: string;
      readonly until: string;
      readonly ongoing: string;
      readonly noDescription: string;
    };
    readonly people: {
      readonly title: string;
      readonly empty: string;
      readonly expected: string;
      readonly noDate: string;
      readonly overdue: string;
    };
    readonly other: {
      readonly title: string;
      readonly empty: string;
      readonly hint: string;
    };
    readonly receivables: {
      readonly label: string;
      readonly note: string;
    };
    readonly fixedCosts: {
      readonly title: string;
      readonly estimate: string;
      readonly note: string;
      readonly link: string;
    };
    readonly schedule: {
      readonly title: string;
      readonly description: string;
      readonly horizon: string;
      readonly horizonOption: string;
      readonly chartLabel: string;
      readonly remainingLine: string;
      readonly empty: string;
      readonly dueLine: string;
      readonly chips: {
        readonly overdue: string;
        readonly undated: string;
        readonly beyond: string;
      };
      readonly payoff: Readonly<Record<'on' | 'UNDATED_DEBTS' | 'BEYOND_HORIZON', string>>;
    };
    readonly goal: {
      readonly title: string;
      readonly none: string;
      readonly create: string;
      readonly open: string;
      readonly building: string;
      readonly progress: string;
    };
    readonly ongoing: {
      readonly title: string;
      readonly description: string;
      readonly card: string;
      readonly descriptionField: string;
      readonly installmentAmount: string;
      readonly totalInstallments: string;
      readonly remainingInstallments: string;
      readonly remainingHint: string;
      readonly firstInvoiceDate: string;
      readonly firstInvoiceHint: string;
      readonly noCards: string;
      readonly addCard: string;
      readonly preview: {
        readonly title: string;
        readonly loading: string;
        readonly text: string;
        readonly note: string;
      };
      readonly save: string;
      readonly saving: string;
      readonly cancel: string;
      readonly toast: string;
    };
    readonly home: {
      readonly title: string;
      readonly open: string;
      readonly empty: string;
      readonly emptyAction: string;
      readonly loading: string;
      readonly error: string;
      readonly retry: string;
    };
  };

  /** Dinheiro a receber de terceiros (2.14.0). Valores e datas vêm da API; nada é calculado no front. */
  abstract readonly thirdParties: {
    readonly title: string;
    readonly description: string;
    readonly loading: string;
    readonly empty: {
      readonly title: string;
      readonly description: string;
      readonly action: string;
    };
    readonly total: {
      readonly title: string;
      readonly owed: string;
      readonly received: string;
      readonly pending: string;
      /** `{date}`. */
      readonly asOf: string;
      readonly note: string;
    };
    readonly people: {
      readonly title: string;
      readonly owed: string;
      readonly received: string;
      readonly pending: string;
      readonly none: string;
      readonly noDescription: string;
      /** `{date}`. */
      readonly expected: string;
      readonly source: Readonly<Record<'DEBT' | 'EXPENSE' | 'RECEIPT', string>>;
    };
    readonly receipts: {
      readonly register: string;
      /** "Recebido (já refletido no saldo)": o dinheiro já está no saldo observado. */
      readonly reflected: string;
      readonly remove: string;
      readonly removeLabel: string;
      readonly removeConfirm: {
        readonly title: string;
        readonly description: string;
        readonly confirm: string;
      };
      readonly toast: { readonly recorded: string; readonly removed: string };
      readonly modal: {
        readonly title: string;
        readonly description: string;
        readonly noPeople: string;
        readonly person: string;
        readonly amount: string;
        readonly date: string;
        readonly link: string;
        readonly linkHint: string;
        readonly noLink: string;
        readonly note: string;
        readonly save: string;
        readonly saving: string;
        readonly cancel: string;
      };
    };
    readonly month: {
      readonly title: string;
      readonly description: string;
      readonly picker: string;
      readonly gross: string;
      readonly refunds: string;
      readonly personalNet: string;
      readonly thirdParty: string;
      readonly reimbursed: string;
      readonly pending: string;
      readonly note: string;
    };
  };

  /** Compromissos acompanhados (2.14.0): só acompanhamento, sem mexer em contas nem no total de dívidas. */
  abstract readonly commitments: {
    readonly title: string;
    readonly description: string;
    readonly loading: string;
    readonly add: string;
    readonly kinds: Readonly<Record<'TRACKED_THIRD_PARTY' | 'LONG_TERM_PROJECT', string>>;
    readonly itemTypes: Readonly<
      Record<'DOWN_PAYMENT' | 'INSTALLMENT' | 'EXTRAORDINARY' | 'FINANCING', string>
    >;
    readonly empty: {
      readonly title: string;
      readonly description: string;
      readonly action: string;
    };
    readonly row: {
      /** `{name}`. */
      readonly counterparty: string;
      /** `{paid}` e `{total}`. */
      readonly installments: string;
      /** `{date}`. */
      readonly nextDue: string;
      readonly paid: string;
      readonly balance: string;
      /** `{percent}`. */
      readonly progress: string;
      readonly balanceUnknown: string;
      /** `{name}`. */
      readonly open: string;
    };
    readonly detail: {
      readonly back: string;
      readonly loading: string;
      readonly notFound: {
        readonly title: string;
        readonly description: string;
      };
      readonly total: string;
      readonly paid: string;
      readonly balance: string;
      readonly progress: string;
      readonly directPending: string;
      readonly financingPending: string;
      readonly financingNote: string;
      readonly installments: string;
      readonly nextDue: string;
      readonly counterparty: string;
      readonly notes: string;
      readonly trackedNote: string;
      readonly onlyTracking: string;
      readonly pendingByMonth: string;
      readonly schedule: {
        readonly title: string;
        readonly empty: string;
        /** `{date}`. */
        readonly paidOn: string;
        readonly pending: string;
        readonly noDate: string;
        /** `{date}`. */
        readonly due: string;
        readonly markPaid: string;
        /** `{label}`. */
        readonly markPaidFor: string;
        readonly dialog: {
          readonly title: string;
          /** `{label}`. */
          readonly description: string;
          readonly date: string;
          readonly confirm: string;
          readonly saving: string;
          readonly cancel: string;
        };
        readonly toast: string;
      };
      readonly progressForm: {
        readonly title: string;
        readonly installmentsPaid: string;
        readonly paidAmount: string;
        readonly nextDueDate: string;
        readonly notes: string;
        readonly save: string;
        readonly saving: string;
        readonly toast: string;
      };
    };
    readonly form: {
      readonly title: string;
      readonly kind: string;
      readonly name: string;
      readonly counterparty: string;
      readonly notes: string;
      readonly installmentsTotal: string;
      readonly installmentsPaid: string;
      readonly paidAmount: string;
      readonly nextDueDate: string;
      readonly trackedNote: string;
      readonly schedule: {
        readonly title: string;
        readonly hint: string;
        readonly empty: string;
        readonly add: string;
        /** `{number}`. */
        readonly item: string;
        /** `{number}`. */
        readonly remove: string;
        readonly label: string;
        readonly type: string;
        readonly dueDate: string;
        readonly amount: string;
        readonly paid: string;
        readonly paidOn: string;
      };
      readonly save: string;
      readonly saving: string;
      readonly cancel: string;
      readonly toast: string;
    };
  };

  /** Telas "sucintas" (Início e demais): só o essencial acima da dobra. */
  abstract readonly brief: {
    readonly register: string;
    readonly registerMore: string;
    readonly result: string;
    readonly resultCaption: string;
    readonly savings: string;
    readonly upcoming: {
      readonly title: string;
      readonly empty: string;
      readonly viewAll: string;
    };
    readonly featuredGoal: {
      readonly title: string;
      readonly empty: string;
      readonly choose: string;
      /** `{name}`. */
      readonly open: string;
      readonly price: string;
      /** `{name}`. */
      readonly photosLabel: string;
      readonly previous: string;
      readonly next: string;
      readonly pause: string;
      readonly play: string;
      readonly indicators: string;
      /** `{n}`, `{total}`. */
      readonly goTo: string;
    };
    readonly viewTransactions: string;
    readonly panorama: {
      readonly description: string;
    };
    readonly settingsLinks: string;
    readonly more: string;
  };

  abstract readonly notFound: EmptyStateCopy & {
    readonly pageTitle: string;
    readonly goHome: string;
  };
}
