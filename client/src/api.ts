import type {
  ApiError as ApiErrorBody,
  AuthResponse,
  ErrorCode,
  LoginRequest,
  RegisterRequest,
  User,
} from '../../shared/types.ts';

/** A failed API call. `code` is the server's error code; the UI turns it into words via i18n. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields: string[];

  constructor(status: number, code: ErrorCode, fields: string[] = []) {
    super(code);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'internal'); // network down / server unreachable
  }
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
  // Non-JSON failures (e.g. proxy 502 HTML) fall back to 'internal'.
  const data = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
  throw new ApiError(res.status, data?.error ?? 'internal', data?.fields ?? []);
}

export const register = (body: RegisterRequest) =>
  request<AuthResponse>('POST', '/auth/register', body).then((r) => r.user);

export const login = (body: LoginRequest) =>
  request<AuthResponse>('POST', '/auth/login', body).then((r) => r.user);

export const logout = () => request<void>('POST', '/auth/logout');

export const me = (): Promise<User> => request<AuthResponse>('GET', '/auth/me').then((r) => r.user);
