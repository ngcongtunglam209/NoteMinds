import { useEffect, useId, useRef, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { Link, Navigate, useLocation, type Location } from 'react-router';
import { ApiError } from './api.ts';
import { useAuth } from './auth.tsx';
import { useT } from './i18n.tsx';
import { Turnstile, turnstileEnabled } from './Turnstile.tsx';

type FieldName = 'login' | 'password' | 'username' | 'email' | 'displayName';
type FormValues = Record<string, string>;

// 409s carry no `fields`; point them at the field the user has to change.
function invalidFields(error: ApiError): string[] {
  if (error.code === 'username_taken') return ['username'];
  if (error.code === 'email_taken') return ['email'];
  return error.fields;
}

/** Shared submit plumbing: pending state, server errors, focus on the first bad field, captcha token. */
function useAuthForm(submit: (values: FormValues, turnstileToken: string | undefined) => Promise<void>) {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const name = error && invalidFields(error)[0];
    const el = name && formRef.current?.elements.namedItem(name);
    if (el instanceof HTMLElement) el.focus();
  }, [error]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget)) as FormValues;
    setPending(true);
    setError(null);
    try {
      await submit(values, token ?? undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'internal'));
      if (turnstileEnabled) {
        setToken(null);
        setAttempt((n) => n + 1); // remounts the widget: the old token is spent
      }
    } finally {
      setPending(false);
    }
  }

  const fieldError = (name: FieldName) =>
    error && invalidFields(error).includes(name)
      ? t(error.code === 'invalid_input' ? `field.${name}` : `error.${error.code}`)
      : undefined;

  return {
    formRef,
    onSubmit,
    pending,
    fieldError,
    submitDisabled: pending || (turnstileEnabled && !token),
    formError: error && <p role="alert">{t(`error.${error.code}`)}</p>,
    captcha: turnstileEnabled && <Turnstile key={attempt} onToken={setToken} />,
  };
}

function Field({ label, error, ...input }: { label: string; error?: string; name: FieldName } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} {...input} />
      {error && <p id={errorId}>{error}</p>}
    </div>
  );
}

/** Where RequireAuth was sending the user before it redirected them to log in. */
function useReturnTo(): Partial<Location> | string {
  return (useLocation().state as { from?: Location } | null)?.from ?? '/';
}

export function LoginPage() {
  const t = useT();
  const location = useLocation();
  const returnTo = useReturnTo();
  const { user, login } = useAuth();
  const form = useAuthForm((v, turnstileToken) => login({ login: v.login, password: v.password, turnstileToken }));

  if (user) return <Navigate to={returnTo} replace />;

  return (
    <section aria-labelledby="login-title">
      <h1 id="login-title">{t('auth.login')}</h1>
      <form ref={form.formRef} onSubmit={form.onSubmit}>
        {form.formError}
        <Field
          name="login"
          label={t('auth.loginOrEmail')}
          error={form.fieldError('login')}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
        />
        <Field
          name="password"
          type="password"
          label={t('auth.password')}
          error={form.fieldError('password')}
          autoComplete="current-password"
          required
          maxLength={128}
        />
        {form.captcha}
        <button type="submit" disabled={form.submitDisabled}>
          {form.pending ? t('auth.processing') : t('auth.login')}
        </button>
      </form>
      <p>
        {t('auth.noAccount')} <Link to="/register" state={location.state}>{t('auth.register')}</Link>
      </p>
    </section>
  );
}

export function RegisterPage() {
  const t = useT();
  const location = useLocation();
  const returnTo = useReturnTo();
  const { user, register } = useAuth();
  const form = useAuthForm((v, turnstileToken) =>
    register({
      username: v.username,
      email: v.email,
      password: v.password,
      displayName: v.displayName.trim() || undefined, // server rejects an empty string
      turnstileToken,
    }),
  );

  if (user) return <Navigate to={returnTo} replace />;

  return (
    <section aria-labelledby="register-title">
      <h1 id="register-title">{t('auth.registerTitle')}</h1>
      <form ref={form.formRef} onSubmit={form.onSubmit}>
        {form.formError}
        <Field
          name="username"
          label={t('auth.username')}
          error={form.fieldError('username')}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={3}
          maxLength={30}
          pattern="[A-Za-z0-9_.\-]{3,30}"
        />
        <Field
          name="email"
          type="email"
          label={t('auth.email')}
          error={form.fieldError('email')}
          autoComplete="email"
          required
          maxLength={254}
        />
        <Field
          name="password"
          type="password"
          label={t('auth.password')}
          error={form.fieldError('password')}
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
        />
        <Field
          name="displayName"
          label={t('auth.displayName')}
          error={form.fieldError('displayName')}
          autoComplete="nickname"
          maxLength={50}
        />
        {form.captcha}
        <button type="submit" disabled={form.submitDisabled}>
          {form.pending ? t('auth.processing') : t('auth.register')}
        </button>
      </form>
      <p>
        {t('auth.hasAccount')} <Link to="/login" state={location.state}>{t('auth.login')}</Link>
      </p>
    </section>
  );
}
