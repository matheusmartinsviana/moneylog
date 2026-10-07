import { Observable } from 'rxjs';

import type {
  DownloadedFile,
  ImportConflictMode,
  ImportReport,
} from '~/modules/notes/core/types/note';

/** Porta do vault: exportar e importar o zip compatível com o Obsidian (S-157). */
export abstract class VaultGateway {
  abstract export(): Observable<DownloadedFile>;
  /** Tudo ou nada no backend; `422 VAULT_IMPORT_INVALID`/`VAULT_IMPORT_TOO_LARGE` nada grava. */
  abstract import(file: File, mode: ImportConflictMode): Observable<ImportReport>;
}
