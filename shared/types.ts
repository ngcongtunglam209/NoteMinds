// API contract shared by server and client. Type-only: no runtime code here.

export type Role = 'user' | 'admin';

export interface User {
  id: number;
  username: string;
  email: string;
  displayName: string | null;
  role: Role;
  plan: string;
  planExpiresAt: string | null;
  emailVerified: boolean;
  createdAt: string;
}

// Errors are codes, not sentences: the client owns the wording (vi/en locales).
export type ErrorCode =
  | 'invalid_input'
  | 'captcha_failed'
  | 'username_taken'
  | 'email_taken'
  | 'invalid_credentials'
  | 'unauthorized'
  | 'rate_limited'
  | 'not_found'
  | 'internal';

export interface ApiError {
  error: ErrorCode;
  fields?: string[];
}

export interface AuthResponse {
  user: User;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  turnstileToken?: string;
}

export interface LoginRequest {
  login: string; // username or email
  password: string;
  turnstileToken?: string;
}
