import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { filter, map, switchMap, take, timer } from 'rxjs';

import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { SessionFacade } from '~/modules/auth/core/facades/session.facade';
import { safeReturnUrl } from '~/modules/auth/core/types/return-url';

/** Limites do servidor (ADR-015), usados só como dica ao vivo: a validação real é do backend. */
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72;

/**
 * Login (smart, fora do shell): fala só com a facade de sessão do módulo `auth` (FE 01). O botão
 * não duplica o envio (a facade usa `exhaustMap`) e o e-mail digitado se mantém depois de um erro.
 *
 * Primeiro acesso (ADR-015): ao abrir, consulta `GET /v1/auth/status`; se o dono ainda não tem senha,
 * mostra "Primeiro acesso" (e-mail + código de configuração + nova senha) no lugar do login.
 */
@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.page.html',
  styleUrl: './login.page.css',
})
export class LoginPage {
  private readonly session = inject(SessionFacade);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly t = inject(I18nService).t;

  /** Destino depois do login (query param `returnUrl`, ligado pelo roteador). */
  readonly returnUrl = input<string>();

  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
  });

  /** `undefined`: consultando; `null`: não deu para consultar (login normal com aviso). */
  protected readonly setupRequired = toSignal(this.session.passwordSetupRequired());
  protected readonly checking = computed(() => this.setupRequired() === undefined);
  protected readonly setupMode = computed(() => this.setupRequired() === true);

  protected readonly setupForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
    setupCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(512)],
    }),
    newPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    confirmPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  private readonly setupValues = toSignal(this.setupForm.valueChanges, {
    initialValue: this.setupForm.getRawValue(),
  });

  /** Regras do servidor mostradas ao vivo, só como dica (nunca bloqueiam o envio). */
  protected readonly rules = computed(() => {
    const { newPassword = '', email = '' } = this.setupValues();
    const t = this.t().auth.setup;
    const typed = newPassword.length > 0;
    return [
      {
        key: 'length',
        text: t.ruleLength,
        met: typed && [...newPassword].length >= MIN_PASSWORD_LENGTH,
      },
      {
        key: 'bytes',
        text: t.ruleBytes,
        met: typed && new TextEncoder().encode(newPassword).length <= MAX_PASSWORD_BYTES,
      },
      {
        key: 'email',
        text: t.ruleNotEmail,
        met: typed && newPassword.trim().toLowerCase() !== email.trim().toLowerCase(),
      },
    ];
  });

  protected readonly setupSubmitting = computed(
    () => this.session.setupState().status === 'submitting',
  );
  /** Segundos que faltam para poder tentar de novo depois de um 429 (0 = liberado). */
  protected readonly retryRemaining = signal(0);
  protected readonly setupBlocked = computed(
    () => this.setupSubmitting() || this.retryRemaining() > 0,
  );

  protected readonly setupError = computed(() => {
    const state = this.session.setupState();
    if (state.status !== 'failed') return null;
    const errors = this.t().auth.setup.errors;
    switch (state.failure.reason) {
      case 'invalid_setup_code':
        return errors.invalidCode;
      case 'rate_limited':
        return interpolate(errors.rateLimited, {
          seconds: String(state.failure.retryAfterSeconds ?? 60),
        });
      case 'validation':
        return errors.validation;
      case 'network':
        return errors.network;
      // `weak_password` aparece no campo da senha.
      case 'weak_password':
        return null;
      default:
        return errors.unavailable;
    }
  });

  protected readonly submitting = computed(() => this.session.loginState().status === 'submitting');

  protected readonly errorMessage = computed(() => {
    const state = this.session.loginState();
    if (state.status !== 'failed') return null;
    const errors = this.t().auth.login.errors;
    const { failure } = state;
    switch (failure.reason) {
      case 'invalid_credentials':
        return errors.invalid;
      case 'rate_limited': {
        const seconds = failure.retryAfterSeconds ?? 60;
        return interpolate(errors.rateLimited, {
          minutes: String(Math.max(1, Math.ceil(seconds / 60))),
        });
      }
      case 'network':
        return errors.network;
      default:
        return errors.unavailable;
    }
  });

  constructor() {
    // Contagem regressiva do `Retry-After`.
    toObservable(this.session.setupState)
      .pipe(
        map((state) =>
          state.status === 'failed' && state.failure.reason === 'rate_limited'
            ? (state.failure.retryAfterSeconds ?? 60)
            : null,
        ),
        filter((seconds) => seconds !== null),
        switchMap((seconds) =>
          timer(0, 1000).pipe(
            take(seconds + 1),
            map((elapsed) => seconds - elapsed),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((remaining) => this.retryRemaining.set(remaining));

    // Senha fraca: o erro vai no campo da senha e o código continua valendo.
    effect(() => {
      const state = this.session.setupState();
      if (state.status === 'failed' && state.failure.reason === 'weak_password') {
        const control = this.setupForm.controls.newPassword;
        control.setErrors({ server: 'WEAK_PASSWORD' });
        control.markAsTouched();
        this.focus('setup-new-password');
      }
    });

    // Foco inicial no primeiro campo do modo ativo.
    effect(() => {
      const target = this.checking() ? null : this.setupMode() ? 'setup-email' : 'login-email';
      if (target) afterNextRender(() => this.focus(target), { injector: this.injector });
    });

    this.session.signedIn$.pipe(takeUntilDestroyed()).subscribe(() => {
      void this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    });
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.session.login({ email: email.trim(), password });
  }

  protected interpolateSeconds(seconds: number): string {
    return interpolate(this.t().auth.setup.retryIn, { seconds: String(seconds) });
  }

  private focus(cy: string): void {
    this.host.nativeElement.querySelector<HTMLElement>(`[data-cy="${cy}"]`)?.focus();
  }

  protected onSetupSubmit(): void {
    const { email, setupCode, newPassword, confirmPassword } = this.setupForm.getRawValue();
    const confirm = this.setupForm.controls.confirmPassword;
    confirm.updateValueAndValidity({ emitEvent: false });
    if (newPassword !== confirmPassword) confirm.setErrors({ server: 'PASSWORD_MISMATCH' });
    if (this.setupForm.invalid || this.setupBlocked()) {
      this.setupForm.markAllAsTouched();
      return;
    }
    this.session.setupPassword({ email: email.trim(), setupCode: setupCode.trim(), newPassword });
  }
}
