import type {
  ImportReportResponse,
  NoteCreateRequest,
  NoteResponse,
  NoteSummarySliceResponse,
} from '~/modules/notes/infra/responses/note.response';

/** Ambiente mock (S-67): o vault está vazio. Mesmo formato bruto da API. */
export const EMPTY_NOTES: NoteSummarySliceResponse = { items: [], hasNext: false };

/**
 * Ambiente mock: a nota que "nasceu" de uma criação (sem persistir: o "banco" continua vazio, então abrir a
 * nota depois dá "não encontrada"). A chave de idempotência vira o id, como nas outras criações.
 */
export function newMockNote(id: string, body: NoteCreateRequest): NoteResponse {
  const name = (body.path.split('/').pop() ?? body.path).replace(/\.md$/i, '');
  return {
    id,
    path: body.path,
    title: name,
    body: body.body,
    tags: [],
    links: [],
    version: 0,
    trashedAt: null,
    createdAt: '1970-01-01T00:00:00Z',
    updatedAt: '1970-01-01T00:00:00Z',
  };
}

export const MOCK_VAULT_FILENAME = 'moneylog-vault.zip';
/** Um zip vazio válido (só o registro de fim do diretório central). */
export const MOCK_VAULT_ZIP = new Uint8Array([
  0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

/** Importação no mock: nada é gravado. */
export const MOCK_IMPORT_REPORT: ImportReportResponse = {
  created: 0,
  skipped: 0,
  pendingLinks: 0,
  ignoredFiles: [],
  skippedFiles: [],
  renamedFiles: [],
  warnings: [],
};

/** Prefixo da chave de `sessionStorage` com que os testes E2E (Playwright) semeiam uma nota no ambiente mock. */
export const MOCK_NOTE_SEED_PREFIX = 'moneylog.mock.note.';

/**
 * Ambiente mock: o "banco" está vazio, mas um teste E2E pode **semear uma nota** (JSON de `NoteResponse` em
 * `sessionStorage['moneylog.mock.note.<id>']`) para abrir o editor com um Markdown hostil sem backend. Só é
 * lido com `API_MOCKS` ligado; qualquer falha (storage bloqueado, JSON inválido) é "sem nota".
 */
export function seededMockNote(id: string): NoteResponse | null {
  try {
    const raw = window.sessionStorage.getItem(MOCK_NOTE_SEED_PREFIX + id);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value === 'object' && value !== null && (value as NoteResponse).id === id) {
      return value as NoteResponse;
    }
  } catch {
    // sem nota semeada
  }
  return null;
}
