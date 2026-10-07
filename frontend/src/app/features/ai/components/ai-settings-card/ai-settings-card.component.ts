import { ChangeDetectionStrategy, Component, effect, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { ErrorStateComponent } from '~/app/common/components/error-state/error-state.component';
import { SwitchComponent } from '~/app/common/components/forms/switch/switch.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { problemMessage } from '~/app/common/i18n/problem-message';
import { AiSettingsFacade } from '~/modules/ai/core/facades/ai-settings.facade';

/** Preferência da mensagem diária com IA (desligada por padrão). Cada mudança é salva e o estado vem da resposta. */
@Component({
  selector: 'app-ai-settings-card',
  imports: [ReactiveFormsModule, SwitchComponent, ErrorStateComponent],
  providers: [AiSettingsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (facade.state().status) {
      @case ('loading') {
        <p role="status" data-cy="ai-settings-loading">{{ t().ai.settings.loading }}</p>
      }
      @case ('error') {
        <app-error-state [problem]="loadProblem()" (retry)="facade.load()" />
      }
      @case ('ready') {
        <app-switch
          [formControl]="daily"
          fieldId="ai-daily-message"
          [label]="t().ai.settings.label"
          [hint]="t().ai.settings.hint"
        />
        @if (facade.problem(); as problem) {
          <p role="alert" data-cy="ai-settings-error">{{ message(problem) }}</p>
        }
      }
    }
  `,
})
export class AiSettingsCardComponent implements OnInit {
  protected readonly facade = inject(AiSettingsFacade);
  protected readonly t = inject(I18nService).t;
  protected readonly daily = new FormControl(false, { nonNullable: true });

  constructor() {
    effect(() => {
      const settings = this.facade.settings();
      if (settings !== null)
        this.daily.setValue(settings.dailyMessageEnabled, { emitEvent: false });
    });
    effect(() => {
      if (this.facade.saving()) this.daily.disable({ emitEvent: false });
      else this.daily.enable({ emitEvent: false });
    });
    effect(() => {
      // Falhou ao salvar: o interruptor volta ao que o backend tem.
      const settings = this.facade.settings();
      if (this.facade.problem() !== null && settings !== null)
        this.daily.setValue(settings.dailyMessageEnabled, { emitEvent: false });
    });
    this.daily.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((dailyMessageEnabled) => this.facade.save({ dailyMessageEnabled }));
  }

  ngOnInit(): void {
    this.facade.load();
  }

  protected loadProblem() {
    const s = this.facade.state();
    return s.status === 'error' ? s.problem : null;
  }

  protected message(problem: Parameters<typeof problemMessage>[0]): string {
    return problemMessage(problem, this.t().errors);
  }
}
