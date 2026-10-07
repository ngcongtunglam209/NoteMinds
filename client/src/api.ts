import type {
  ApiError as ApiErrorBody,
  AuthResponse,
  ErrorCode,
  LoginRequest,
  RegisterRequest,
  User,
} from '../../shared/types.ts';
import type { Document, DocumentListResponse, DocumentResponse, DocumentSummary, UploadResponse } from '../../shared/documents.ts';
import type { ChatMessage, SrsGrade } from '../../shared/study.ts';
import type {
  ArtifactKind,
  ArtifactResponse,
  ArtifactState,
  ChatHistoryResponse,
  DueCardsResponse,
  QuizAttempt,
  QuizAttemptResponse,
  QuizAttemptsResponse,
  ReviewCard,
  ReviewResponse,
  StudyStatusResponse,
} from '../../shared/study-api.ts';

/** A failed API call. `code` is the server's error code; the UI turns it into words via i18n. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields: string[];
  /** Quota errors (upload, chat): when the daily quota resets, ISO timestamp. */
  readonly resetAt?: string;

  constructor(status: number, code: ErrorCode, fields: string[] = [], resetAt?: string) {
    super(code);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.resetAt = resetAt;
  }
}

type Method = 'GET' | 'POST' | 'DELETE';

/** Sends JSON (or FormData as-is, so the browser sets the multipart boundary); throws ApiError unless 2xx. */
async function send(method: Method, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      signal,
      headers: body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'internal'); // network down / server unreachable / aborted
  }
  if (res.ok) return res;
  // Non-JSON failures (e.g. proxy 502 HTML) fall back to 'internal'.
  const data = (await res.json().catch(() => null)) as (Partial<ApiErrorBody> & { resetAt?: string }) | null;
  throw new ApiError(res.status, data?.error ?? 'internal', data?.fields ?? [], data?.resetAt);
}

async function request<T>(method: Method, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await send(method, path, body, signal);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const register = (body: RegisterRequest) =>
  request<AuthResponse>('POST', '/auth/register', body).then((r) => r.user);

export const login = (body: LoginRequest) =>
  request<AuthResponse>('POST', '/auth/login', body).then((r) => r.user);

export const logout = () => request<void>('POST', '/auth/logout');

export const me = (): Promise<User> => request<AuthResponse>('GET', '/auth/me').then((r) => r.user);

// ── Documents ──

export function uploadDocument(file: File): Promise<DocumentSummary> {
  const form = new FormData();
  form.append('file', file);
  return request<UploadResponse>('POST', '/documents', form).then((r) => r.document);
}

export const listDocuments = (signal?: AbortSignal): Promise<DocumentSummary[]> =>
  request<DocumentListResponse>('GET', '/documents', undefined, signal).then((r) => r.documents);

export const getDocument = (id: number, signal?: AbortSignal): Promise<Document> =>
  request<DocumentResponse>('GET', `/documents/${id}`, undefined, signal).then((r) => r.document);

export const deleteDocument = (id: number) => request<void>('DELETE', `/documents/${id}`);

// ── Study artifacts ──

export const getStudy = (docId: number, signal?: AbortSignal) =>
  request<StudyStatusResponse>('GET', `/documents/${docId}/study`, undefined, signal);

export const getArtifact = <K extends ArtifactKind>(docId: number, kind: K, signal?: AbortSignal) =>
  request<ArtifactResponse<K>>('GET', `/documents/${docId}/study/${kind}`, undefined, signal);

export const generateArtifact = (docId: number, kind: ArtifactKind) =>
  request<ArtifactState>('POST', `/documents/${docId}/study/${kind}`);

export const cancelArtifact = (docId: number, kind: ArtifactKind) =>
  request<ArtifactState>('DELETE', `/documents/${docId}/study/${kind}/run`);

// ── SRS review ──

export const getDueCards = (documentId?: number, signal?: AbortSignal) =>
  request<DueCardsResponse>('GET', `/review/due${documentId === undefined ? '' : `?documentId=${documentId}`}`, undefined, signal);

export const reviewCard = (cardId: number, grade: SrsGrade): Promise<ReviewCard> =>
  request<ReviewResponse>('POST', `/cards/${cardId}/review`, { grade }).then((r) => r.card);

// ── Quiz attempts ──

export const submitQuizAttempt = (docId: number, answers: (number | null)[]): Promise<QuizAttempt> =>
  request<QuizAttemptResponse>('POST', `/documents/${docId}/quiz/attempts`, { answers }).then((r) => r.attempt);

export const listQuizAttempts = (docId: number, signal?: AbortSignal): Promise<QuizAttempt[]> =>
  request<QuizAttemptsResponse>('GET', `/documents/${docId}/quiz/attempts`, undefined, signal).then((r) => r.attempts);

// ── Chat ──

export const getChatHistory = (docId: number, signal?: AbortSignal): Promise<ChatMessage[]> =>
  request<ChatHistoryResponse>('GET', `/documents/${docId}/chat`, undefined, signal).then((r) => r.messages);

/**
 * Streams the answer as text chunks. Errors before the first chunk throw the server's ApiError
 * (e.g. chat_quota_exceeded with resetAt); a dropped connection mid-answer throws ApiError(0, 'internal')
 * so a truncated answer never looks complete. Aborting `signal` stops it (and the server's LLM call).
 */
export async function* askChat(docId: number, question: string, signal?: AbortSignal): AsyncGenerator<string> {
  const res = await send('POST', `/documents/${docId}/chat`, { question }, signal);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<string>;
      try {
        chunk = await reader.read();
      } catch {
        throw new ApiError(0, 'internal');
      }
      if (chunk.done) return;
      yield chunk.value;
    }
  } finally {
    reader.cancel().catch(() => {}); // early exit (break/abort): close the connection
  }
}
