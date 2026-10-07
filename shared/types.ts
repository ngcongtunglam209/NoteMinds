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
  | 'internal'
  | 'quota_exceeded'
  | 'unsupported_file'
  | 'audio_unsupported'
  | 'file_too_large'
  | 'extraction_failed'
  | 'no_text'
  | 'document_not_ready'
  | 'document_too_long'
  | 'ai_unavailable'
  | 'ai_bad_output'
  | 'chat_quota_exceeded';

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
