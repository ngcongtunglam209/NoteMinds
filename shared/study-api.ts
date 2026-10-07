// Study API contract (artifacts, SRS review, quiz attempts, chat). Type-only: no runtime code here.
import type { ErrorCode } from './types.ts';
import type { ChatMessage, Flashcard, FlashcardDeck, Mindmap, Quiz, SrsGrade, SrsState, Summary } from './study.ts';

// Errors: 404 not_found (unknown or someone else's document/card), 409 document_not_ready
// (document still processing or failed), 503 ai_unavailable, 502 ai_bad_output, 413 document_too_long.

export type ArtifactKind = 'summary' | 'mindmap' | 'flashcards' | 'quiz';
export type ArtifactStatus = 'none' | 'generating' | 'ready' | 'failed';

export interface ArtifactPayloads {
  summary: Summary;
  mindmap: Mindmap;
  flashcards: FlashcardDeck;
  quiz: Quiz;
}

export interface ArtifactState {
  status: ArtifactStatus;
  error: ErrorCode | null; // set when status is 'failed': 'ai_unavailable' | 'ai_bad_output' | 'document_too_long'
  updatedAt: string | null; // null when status is 'none'
}

// GET /api/documents/:id/study
// The summary starts by itself once the document is ready; the other kinds wait for a POST.
export interface StudyStatusResponse {
  artifacts: Record<ArtifactKind, ArtifactState>;
  dueCount: number; // this document's cards due now
}

// GET /api/documents/:id/study/:kind
// payload is the last good version: it stays set while a regeneration runs, fails or is cancelled.
export interface ArtifactResponse<K extends ArtifactKind = ArtifactKind> extends ArtifactState {
  payload: ArtifactPayloads[K] | null;
}

// POST /api/documents/:id/study/:kind → 202 ArtifactState ('generating'); no-op if already running.
// Poll GET /study until it leaves 'generating'.
// DELETE /api/documents/:id/study/:kind/run → 200 ArtifactState: cancels a running generation and
// restores the state from before it ('none' if there was none). Idempotent.

// ── SRS review. A card is due when dueAt <= now; new cards are due immediately. ──

export interface ReviewCard extends Flashcard, SrsState {
  id: number;
  documentId: number;
}

// GET /api/review/due[?documentId=] → oldest due first, at most 100 cards.
export interface DueCardsResponse {
  cards: ReviewCard[];
  dueCount: number; // total due, can exceed cards.length
}

// POST /api/cards/:id/review
export interface ReviewRequest {
  grade: SrsGrade;
}

export interface ReviewResponse {
  card: ReviewCard;
}

// ── Quiz attempts. Attempts are cleared when the quiz is regenerated. ──

// POST /api/documents/:id/quiz/attempts → 201 QuizAttemptResponse. One entry per question.
export interface QuizAttemptRequest {
  answers: (number | null)[]; // chosen option index, null when skipped
}

export interface QuizAttempt {
  id: number;
  answers: (number | null)[];
  score: number; // correct answers
  total: number; // questions
  createdAt: string;
}

export interface QuizAttemptResponse {
  attempt: QuizAttempt;
}

// GET /api/documents/:id/quiz/attempts → newest first, at most 20.
export interface QuizAttemptsResponse {
  attempts: QuizAttempt[];
}

// ── Chat ──

// GET /api/documents/:id/chat → oldest first.
export interface ChatHistoryResponse {
  messages: ChatMessage[];
}

// POST /api/documents/:id/chat → 200 `text/plain; charset=utf-8`, the answer streamed as raw text
// chunks: read res.body with a TextDecoderStream. Errors before the first chunk are normal JSON
// responses; a failure mid-answer aborts the connection (the reader throws) and nothing is saved.
// Both turns are saved once the answer completes. Closing the request cancels the answer.
export interface ChatRequest {
  question: string; // 1-2000 chars
}

/** 429 body when the plan's daily chat quota is used up. */
export interface ChatQuotaExceededError {
  error: 'chat_quota_exceeded';
  resetAt: string; // ISO timestamp of the next UTC midnight
}
