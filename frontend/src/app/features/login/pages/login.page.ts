import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { TextFieldComponent } from '~/app/common/components/forms/text-field/text-field.component';
import { I18nService } from '~/app/common/i18n/i18n.service';
import { interpolate } from '~/app/common/i18n/interpolate';
import { SessionFacade } from '~/modules/auth/core/facades/session.facade';
import { safeReturnUrl } from '~/modules/auth/core/types/return-url';

/**
 * Login (smart, fora do shell): fala só com a facade de sessão do módulo `auth` (FE 01). O botão
 * não duplica o envio (a facade usa `exhaustMap`) e o e-mail digitado se mantém depois de um erro.
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
}
