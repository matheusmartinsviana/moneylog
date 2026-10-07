import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { IconComponent } from '~/app/common/components/icon/icon.component';
import { LiveAnnouncer } from '~/app/common/components/overlay/live-announcer.service';
import { activeModal } from '~/app/common/components/overlay/modal-lock';
import { ViewportService } from '~/app/common/components/overlay/viewport.service';
import { SheetComponent } from '~/app/common/components/sheet/sheet.component';
import { HTML_LANG } from '~/app/common/i18n/i18n';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { SearchFacade } from '~/modules/search/core/facades/search.facade';
import { SEARCH_GROUPS, type SearchGroup } from '~/modules/search/core/types/search';
import { formatIsoDate } from '~/util/date';
import { formatMoney } from '~/util/money';
import { SEARCH_TERM_MAX_LENGTH } from '~/util/search-term';

/** Uma linha do painel: o que mostrar e para onde ir. */
interface SearchOption {
  readonly domId: string;
  readonly group: SearchGroup;
  readonly title: string;
  readonly meta: string;
  /** Valor do backend, só formatado (movimentações). */
  readonly amount: string | null;
  /** Texto puro (notas): exibido por interpolação, nunca como Markdown nem HTML. */
  readonly snippet: string | null;
  readonly archived: boolean;
  readonly commands: readonly string[];
}

interface SearchSection {
  readonly group: SearchGroup;
  readonly titleId: string;
  readonly title: string;
  readonly options: readonly SearchOption[];
}

let nextUid = 0;

/**
 * Busca global do cabeçalho (T209): campo próprio (`TextField`, nunca `type="search"`) com o padrão WAI-ARIA de
 * combobox + listbox. Digitar pede `GET /v1/search` (espera 300 ms, cancela a anterior) e o painel agrupa
 * Movimentações, Contas, Categorias, Cartões e Notas **como o backend devolveu** (sem total nem soma). O
 * `snippet` da nota é **texto puro** interpolado (o Angular o escapa). Setas e `Enter` navegam e abrem, `Esc` fecha
 * e devolve o foco, `/` foca a busca fora de campos de texto. Em tela compacta (≤ 640 px) vira um botão de lupa que
 * abre uma folha. Erros 400, 429 e de rede têm mensagem e "tentar de novo"; a região viva anuncia a contagem.
 */
@Component({
  selector: 'app-global-search',
  imports: [
    ReactiveFormsModule,
    NgTemplateOutlet,
    TextFieldComponent,
    IconComponent,
    SheetComponent,
  ],
  providers: [SearchFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
    '(document:pointerdown)': 'onDocumentPointerdown($event)',
  },
  templateUrl: './global-search.component.html',
  styleUrl: './global-search.component.css',
})
export class GlobalSearchComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly i18n = inject(I18nService);
  protected readonly facade = inject(SearchFacade);
  protected readonly viewport = inject(ViewportService);
  protected readonly t = this.i18n.t;

  private readonly uid = ++nextUid;
  protected readonly listId = `global-search-list-${this.uid}`;
  protected readonly maxLength = SEARCH_TERM_MAX_LENGTH;

  protected readonly control = new FormControl('', { nonNullable: true });
  /** Painel aberto (campo com foco e texto); `false` depois de `Esc`, de escolher ou de sair do campo. */
  protected readonly open = signal(false);
  protected readonly sheetOpen = signal(false);
  protected readonly active = signal(-1);

  private readonly locale = computed(() => HTML_LANG[this.i18n.language()]);

  protected readonly sections = computed<readonly SearchSection[]>(() => {
    const data = this.facade.data();
    if (data === null) return [];
    const t = this.t();
    const locale = this.locale();
    const mk = (group: SearchGroup, id: string): string =>
      `global-search-${this.uid}-${group}-${id}`;
    const archived = (flag: boolean): string => (flag ? ` · ${t.search.archived}` : '');
    return SEARCH_GROUPS.map((group): SearchSection => {
      const options: SearchOption[] = (() => {
        switch (group) {
          case 'transactions':
            return data.transactions.map((item) => ({
              domId: mk(group, item.id),
              group,
              title: item.description,
              meta: [formatIsoDate(item.date, locale), item.category?.name, item.account?.name]
                .filter((part): part is string => !!part)
                .join(' · '),
              amount: formatMoney(item.amount),
              snippet: null,
              archived: false,
              commands: ['/transactions', item.id],
            }));
          case 'accounts':
            return data.accounts.map((item) => ({
              domId: mk(group, item.id),
              group,
              title: item.name,
              meta:
                (item.institution ??
                  t.accounts.types[item.type as keyof typeof t.accounts.types] ??
                  '') + archived(item.status === 'ARCHIVED'),
              amount: null,
              snippet: null,
              archived: item.status === 'ARCHIVED',
              commands: ['/accounts', item.id],
            }));
          case 'categories':
            return data.categories.map((item) => ({
              domId: mk(group, item.id),
              group,
              title: item.name,
              meta: archived(item.archived).replace(/^ · /, ''),
              amount: null,
              snippet: null,
              archived: item.archived,
              commands: ['/settings/categories'],
            }));
          case 'cards':
            return data.cards.map((item) => ({
              domId: mk(group, item.id),
              group,
              title: item.name,
              meta: (item.institution ?? '') + archived(item.status === 'ARCHIVED'),
              amount: null,
              snippet: null,
              archived: item.status === 'ARCHIVED',
              commands: ['/cards', item.id],
            }));
          case 'notes':
            return data.notes.map((item) => ({
              domId: mk(group, item.id),
              group,
              title: item.title,
              meta: item.path,
              amount: null,
              snippet: item.snippet,
              archived: false,
              commands: ['/notes', item.id],
            }));
        }
      })();
      return {
        group,
        titleId: `global-search-${this.uid}-${group}-title`,
        title: t.search.groups[group],
        options,
      };
    }).filter((section) => section.options.length > 0);
  });

  /** As opções na ordem em que aparecem (as setas andam por esta lista). */
  protected readonly options = computed(() =>
    this.sections().flatMap((section) => section.options),
  );
  protected readonly activeId = computed(() => this.options()[this.active()]?.domId ?? null);
  protected readonly truncated = computed(() => (this.facade.data()?.truncated.length ?? 0) > 0);

  protected readonly status = computed(() => this.facade.state().status);
  protected readonly errorMessage = computed(() => {
    const state = this.facade.state();
    return state.status === 'error' ? this.t().search.errors[state.kind] : null;
  });
  protected readonly emptyMessage = computed(() => {
    const state = this.facade.state();
    return state.status === 'empty' ? interpolate(this.t().search.empty, { q: state.q }) : null;
  });

  /** A lista de resultados está visível (o combobox está "expandido"). */
  protected readonly expanded = computed(
    () => (this.open() || this.sheetOpen()) && this.facade.state().status !== 'idle',
  );
  protected readonly panelVisible = computed(
    () => (this.open() || this.sheetOpen()) && this.control.value.length > 0,
  );

  constructor() {
    this.control.valueChanges.subscribe((text) => {
      this.facade.type(text);
      this.open.set(true);
      this.active.set(-1);
    });

    // Resultado novo: a opção ativa volta ao começo e a região viva anuncia a contagem (ou o vazio/erro).
    effect(() => {
      const state = this.facade.state();
      untracked(() => {
        this.active.set(-1);
        const t = this.t().search;
        if (state.status === 'ready') {
          const count = this.options().length;
          this.announcer.announce(
            count === 1 ? t.countOne : interpolate(t.count, { count: String(count) }),
          );
        } else if (state.status === 'empty') {
          this.announcer.announce(interpolate(t.empty, { q: state.q }));
        } else if (state.status === 'error') {
          this.announcer.announce(t.errors[state.kind]);
        }
      });
    });

    // Mantém a opção ativa à vista dentro do painel que rola.
    effect(() => {
      const id = this.activeId();
      if (id === null) return;
      queueMicrotask(() =>
        this.document.getElementById(id)?.scrollIntoView?.({ block: 'nearest' }),
      );
    });
  }

  protected onFocus(): void {
    if (this.control.value.length > 0) this.open.set(true);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const options = this.options();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open.set(true);
        if (options.length > 0) this.active.set((this.active() + 1) % options.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.open.set(true);
        if (options.length > 0) {
          this.active.set(this.active() <= 0 ? options.length - 1 : this.active() - 1);
        }
        break;
      case 'Enter': {
        const option = options[this.active()];
        if (option) {
          event.preventDefault();
          this.choose(option);
        }
        break;
      }
      case 'Escape':
        if (this.panelVisible() && !this.sheetOpen()) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        }
        break;
    }
  }

  /** Fecha o painel e mantém (ou devolve) o foco no campo. */
  protected close(): void {
    this.open.set(false);
    this.active.set(-1);
    this.focusField();
  }

  protected choose(option: SearchOption): void {
    this.open.set(false);
    this.sheetOpen.set(false);
    this.control.setValue('', { emitEvent: false });
    this.facade.clear();
    void this.router.navigate([...option.commands]);
  }

  protected openSheet(): void {
    this.sheetOpen.set(true);
  }

  protected closeSheet(): void {
    this.sheetOpen.set(false);
    this.active.set(-1);
  }

  /** Atalho `/`: foca a busca, exceto quando o foco já está num campo de texto (ou há um modal aberto). */
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (
      event.key !== '/' ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.defaultPrevented
    )
      return;
    if (isTextEntry(event.target) || activeModal() !== null) return;
    event.preventDefault();
    if (this.viewport.compact()) this.openSheet();
    else this.focusField();
  }

  /** Toque ou clique fora do campo e do painel fecha o painel. */
  protected onDocumentPointerdown(event: PointerEvent): void {
    if (!this.open()) return;
    const target = event.target;
    if (target instanceof Node && this.host.nativeElement.contains(target)) return;
    this.open.set(false);
    this.active.set(-1);
  }

  /** O foco saiu do campo e do painel (Tab): fecha. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.host.nativeElement.contains(next)) return;
    if (!this.sheetOpen()) this.open.set(false);
  }

  private focusField(): void {
    const input = this.host.nativeElement.querySelector<HTMLInputElement>('input');
    input?.focus();
  }

  protected retry(): void {
    this.facade.retry();
    this.focusField();
  }
}

/** Campo em que digitar `/` deve inserir a barra, não focar a busca. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.getAttribute('role') === 'textbox'
  );
}
