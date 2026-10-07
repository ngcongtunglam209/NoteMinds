// Documents API contract. Type-only: no runtime code here.
import type { ErrorCode } from './types.ts';

export type DocumentStatus = 'processing' | 'ready' | 'failed';

/** List item: everything except the extracted text. */
export interface DocumentSummary {
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  error: ErrorCode | null; // set when status is 'failed': 'extraction_failed' | 'no_text'
  charCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Document extends DocumentSummary {
  text: string;
}

// POST /api/documents (multipart, field "file") → 202, then poll GET /:id until status leaves 'processing'.
export interface UploadResponse {
  document: DocumentSummary;
}

export interface DocumentListResponse {
  documents: DocumentSummary[];
}

export interface DocumentResponse {
  document: Document;
}

/** 429 body when the plan's daily upload quota is used up. */
export interface QuotaExceededError {
  error: 'quota_exceeded';
  resetAt: string; // ISO timestamp of the next UTC midnight
}
