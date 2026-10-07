import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';

import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import type { ChoiceOption } from '~/app/common/components/forms/choice-option';
import { FilePickerComponent } from '~/app/common/components/forms/file-picker/file-picker.component';
import { SegmentedControlComponent } from '~/app/common/components/forms/segmented-control/segmented-control.component';
import { SelectComponent } from '~/app/common/components/forms/select/select.component';
import { PageLayoutComponent } from '~/app/common/components/page-layout/page-layout.component';
import { ProgressBarComponent } from '~/app/common/components/progress-bar/progress-bar.component';
import { SectionContainerComponent } from '~/app/common/components/section-container/section-container.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { problemMessage } from '~/app/common/i18n/problem-message';
import {
  MappingChange,
  MappingEditorComponent,
} from '~/app/features/import/components/mapping-editor.component';
import { AccountsListFacade } from '~/modules/accounts/core/facades/accounts-list.facade';
import { CardsListFacade } from '~/modules/cards/core/facades/cards-list.facade';
import { ImportUploadFacade } from '~/modules/imports/core/facades/import-upload.facade';
import { ImportsListFacade } from '~/modules/imports/core/facades/imports-list.facade';
import { IMPORT_MAX_BYTES, type ImportSource } from '~/modules/imports/core/types/import';
import { formatIsoDate } from '~/util/date';

/**
 * Importar extrato (smart): escolhe a conta ou o cartão, o arquivo (CSV/OFX) e, para CSV, o mapeamento de
 * colunas; envia com progresso e cancelamento e leva à revisão do lote. Nada vira movimentação aqui: o lote
 * nasce em revisão. Abaixo, as importações recentes.
 */
@Component({
  selector: 'app-import-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    SectionContainerComponent,
    ErrorStateComponent,
    FilePickerComponent,
    SegmentedControlComponent,
    SelectComponent,
    ProgressBarComponent,
    MappingEditorComponent,
  ],
  providers: [ImportUploadFacade, ImportsListFacade, AccountsListFacade, CardsListFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './import.page.html',
  styleUrl: './import.page.css',
})
export class ImportPage implements OnInit {
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  private readonly accounts = inject(AccountsListFacade);
  private readonly cards = inject(CardsListFacade);
  protected readonly t = this.i18n.t;
  protected readonly upload = inject(ImportUploadFacade);
  protected readonly recent = inject(ImportsListFacade);
  protected readonly maxBytes = IMPORT_MAX_BYTES;

  protected readonly kindControl = new FormControl<string | null>('account');
  protected readonly sourceControl = new FormControl<string | null>(null);
  protected readonly fileControl = new FormControl<File | null>(null);
  protected readonly mapping = signal<MappingChange>({ mapping: null, valid: true });
  protected readonly submitted = signal(false);

  private readonly kind = toSignal(this.kindControl.valueChanges.pipe(startWith('account')), {
    initialValue: 'account',
  });
  private readonly source = toSignal(this.sourceControl.valueChanges.pipe(startWith(null)), {
    initialValue: null,
  });
  private readonly file = toSignal(this.fileControl.valueChanges.pipe(startWith(null)), {
    initialValue: null,
  });

  protected readonly kindOptions = computed<readonly ChoiceOption[]>(() => [
    { value: 'account', label: this.t().imports.upload.kindAccount },
    { value: 'card', label: this.t().imports.upload.kindCard },
  ]);
  protected readonly isCard = computed(() => this.kind() === 'card');
  protected readonly sourceOptions = computed<readonly ChoiceOption[]>(() => {
    if (this.isCard()) {
      return (this.cards.data() ?? []).map((c) => ({ value: c.id, label: c.name }));
    }
    return (this.accounts.data() ?? [])
      .filter((a) => a.liquidity === 'CASH')
      .map((a) => ({ value: a.id, label: a.name }));
  });
  protected readonly noSources = computed(
    () =>
      (this.isCard() ? this.cards.empty() : this.accounts.empty()) &&
      this.sourceOptions().length === 0,
  );
  protected readonly isCsv = computed(
    () => this.file()?.name.toLowerCase().endsWith('.csv') === true,
  );
  protected readonly ratio = computed(() => {
    const percent = this.upload.percent();
    return percent === null ? null : percent / 100;
  });
  protected readonly progressText = computed(() =>
    interpolate(this.t().imports.upload.progress, { percent: String(this.upload.percent() ?? 0) }),
  );
  protected readonly uploadError = computed(() => {
    const problem = this.upload.problem();
    return problem ? problemMessage(problem, this.t().errors) : null;
  });
  protected readonly createdText = computed(() => {
    const locale = HTML_LANG[this.i18n.language()];
    return (iso: string) =>
      interpolate(this.t().imports.recent.createdOn, {
        date: formatIsoDate(iso.slice(0, 10), locale, 'long'),
      });
  });
  protected readonly linesText = computed(
    () => (count: number) => interpolate(this.t().imports.recent.lines, { count: String(count) }),
  );

  constructor() {
    this.upload.uploaded$.pipe(takeUntilDestroyed()).subscribe((batch) => {
      void this.router.navigate(['/import', batch.id]);
    });
    // Trocar conta/cartão: zera a escolha e busca o mapeamento salvo.
    this.kindControl.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.sourceControl.setValue(null);
    });
    effect(() => {
      const id = this.source();
      untracked(() => {
        this.submitted.set(false);
        if (id) this.upload.loadSavedMapping(id);
        else this.upload.clearSavedMapping();
      });
    });
  }

  ngOnInit(): void {
    this.accounts.load('ACTIVE');
    this.cards.load('ACTIVE');
    this.recent.load();
  }

  protected send(event?: Event): void {
    event?.preventDefault();
    this.submitted.set(true);
    const id = this.sourceControl.value;
    const file = this.fileControl.value;
    if (!id || !file || this.upload.uploading()) return;
    if (this.isCsv() && !this.mapping().valid) return;
    const source: ImportSource = this.isCard() ? { kind: 'card', id } : { kind: 'account', id };
    this.upload.start({
      file,
      source,
      format: null,
      mapping: this.isCsv() ? this.mapping().mapping : null,
    });
  }
}
