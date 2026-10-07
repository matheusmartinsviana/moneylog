import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, map, of, Subject, tap } from 'rxjs';

import { VaultGateway } from '~/modules/notes/core/interfaces/vault.gateway';
import type {
  DownloadedFile,
  ImportConflictMode,
  ImportReport,
} from '~/modules/notes/core/types/note';
import { Problem, problemOf } from '~/util/api/problem';

export type ImportState =
  | { readonly status: 'idle' }
  | { readonly status: 'uploading' }
  | { readonly status: 'done'; readonly report: ImportReport }
  | { readonly status: 'error'; readonly problem: Problem };

/**
 * Facade de exportar e importar o vault (zip). `exhaustMap` nos dois: com um em curso o clique seguinte é
 * ignorado. O zip exportado sai em `file$` para a tela entregar ao navegador (gesto do usuário, FE-S-168);
 * a importação é **tudo ou nada** no backend, então uma falha (`VAULT_IMPORT_INVALID`, `VAULT_IMPORT_TOO_LARGE`,
 * `429`) não muda nada na lista. Exportar é leitura e importar com `SKIP` é idempotente: sem `Idempotency-Key`
 * (contrato). Escopo de componente.
 */
@Injectable()
export class VaultFacade {
  private readonly gateway = inject(VaultGateway);
  private readonly exports = new Subject<void>();
  private readonly imports = new Subject<{
    readonly file: File;
    readonly mode: ImportConflictMode;
  }>();
  private readonly fileEvents = new Subject<DownloadedFile>();
  private readonly importedEvents = new Subject<ImportReport>();
  private readonly exportingState = signal(false);
  private readonly exportProblemState = signal<Problem | null>(null);
  private readonly importState = signal<ImportState>({ status: 'idle' });
  private last: { readonly file: File; readonly mode: ImportConflictMode } | null = null;
  private readonly lastMode = signal<ImportConflictMode | null>(null);

  readonly exporting = this.exportingState.asReadonly();
  readonly exportProblem = this.exportProblemState.asReadonly();
  readonly importStatus = this.importState.asReadonly();
  readonly importing = computed(() => this.importState().status === 'uploading');
  /**
   * A importação falhou **sem confirmação** do servidor (rede, 5xx, 504) e o modo é `RENAME`: o zip pode ter
   * sido gravado e repeti-lo duplicaria cada nota como `nome (2)`. Só `SKIP` é idempotente, então só nele o
   * "tentar de novo" é automático (F5). Erro 4xx e 429 são recusas definitivas: nada foi gravado.
   */
  readonly importUncertain = computed(() => {
    const state = this.importState();
    if (state.status !== 'error' || this.lastMode() !== 'RENAME') return false;
    return state.problem.status === 0 || state.problem.status >= 500;
  });
  readonly file$ = this.fileEvents.asObservable();
  readonly imported$ = this.importedEvents.asObservable();

  constructor() {
    this.exports
      .pipe(
        exhaustMap(() => {
          this.exportingState.set(true);
          this.exportProblemState.set(null);
          return this.gateway.export().pipe(
            tap((file) => this.fileEvents.next(file)),
            map(() => null),
            catchError((error: unknown) => of(problemOf(error))),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((problem) => {
        this.exportingState.set(false);
        this.exportProblemState.set(problem);
      });

    this.imports
      .pipe(
        exhaustMap(({ file, mode }) => {
          this.importState.set({ status: 'uploading' });
          return this.gateway.import(file, mode).pipe(
            tap((report) => this.importedEvents.next(report)),
            map((report): ImportState => ({ status: 'done', report })),
            catchError((error: unknown) =>
              of<ImportState>({ status: 'error', problem: problemOf(error) }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.importState.set(state));
  }

  exportVault(): void {
    this.exports.next();
  }

  clearExportProblem(): void {
    this.exportProblemState.set(null);
  }

  importVault(file: File, mode: ImportConflictMode): void {
    this.last = { file, mode };
    this.lastMode.set(mode);
    this.imports.next({ file, mode });
  }

  /**
   * "Tentar de novo" depois de uma falha: reenvia o mesmo arquivo com o mesmo modo. **Não** reenvia quando o
   * resultado é incerto em `RENAME` (`importUncertain`): o usuário confere o vault antes.
   */
  retryImport(): void {
    if (this.last && !this.importUncertain()) this.imports.next(this.last);
  }

  resetImport(): void {
    this.last = null;
    this.lastMode.set(null);
    this.importState.set({ status: 'idle' });
  }
}
