// Data hooks for the library and study screens. Hooks return error codes (ApiError), never text.
// Actions (upload, generate, review, submit...) reject with ApiError; load/poll failures go to `error`.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentStatus, DocumentSummary } from '../../shared/documents.ts';
import type { ChatMessage, SrsGrade } from '../../shared/study.ts';
import type { ArtifactKind, ArtifactState } from '../../shared/study-api.ts';
import * as api from './api.ts';
import { ApiError } from './api.ts';

const POLL_MS = 2000;

const asApiError = (err: unknown) => (err instanceof ApiError ? err : new ApiError(0, 'internal'));

function useMounted() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

/**
 * Loads on mount and whenever `deps` change (the fetcher may return undefined to skip and keep the
 * current data). Reloads every POLL_MS while `pollWhile(data)` holds; a failed poll retries too.
 */
function useLoad<T>(fetcher: (signal: AbortSignal) => Promise<T> | undefined, deps: unknown[], pollWhile?: (data: T) => boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const ac = new AbortController();
    fetcher(ac.signal)?.then(
      (d) => {
        if (ac.signal.aborted) return;
        setData(d);
        setError(null);
      },
      (err) => {
        if (!ac.signal.aborted) setError(asApiError(err));
      },
    );
    return () => ac.abort();
  }, [...deps, tick]); // fetcher is read fresh each run; deps say when to run it

  const polling = data !== null && !!pollWhile?.(data);
  useEffect(() => {
    if (!polling) return;
    const timer = setTimeout(reload, POLL_MS);
    return () => clearTimeout(timer);
  }, [polling, data, error, reload]);

  return { data, setData, error, setError, reload };
}

// ── Documents ──

/** One document with its text; polls while it is being extracted. */
export function useDocument(id: number) {
  const { data, error } = useLoad((signal) => api.getDocument(id, signal), [id], (d) => d.status === 'processing');
  return { document: data, error };
}

/** The library. Polls while any document is processing (e.g. right after an upload). */
export function useDocuments() {
  const { data, setData, error } = useLoad(api.listDocuments, [], (docs) => docs.some((d) => d.status === 'processing'));
  const [uploads, setUploads] = useState(0);
  const mounted = useMounted();

  /** Resolves with the new document (status 'processing'); rejects with e.g. quota_exceeded (+ resetAt). */
  const upload = useCallback(async (file: File): Promise<DocumentSummary> => {
    setUploads((n) => n + 1);
    try {
      const doc = await api.uploadDocument(file);
      if (mounted.current) setData((docs) => [doc, ...(docs ?? [])]);
      return doc;
    } finally {
      if (mounted.current) setUploads((n) => n - 1);
    }
  }, []);

  const remove = useCallback(async (id: number) => {
    await api.deleteDocument(id);
    if (mounted.current) setData((docs) => docs && docs.filter((d) => d.id !== id));
  }, []);

  return { documents: data, upload, remove, uploading: uploads > 0, error };
}

// ── Study artifacts ──

export type Study = ReturnType<typeof useStudy>;

/**
 * Artifact states and due count for a ready document. Pass the document's status (from useDocument):
 * nothing loads until it is 'ready', and the summary the server starts on readiness is picked up then.
 * Polls while any artifact is generating.
 */
export function useStudy(docId: number, documentStatus: DocumentStatus | undefined) {
  const { data: status, setData, error, reload } = useLoad(
    (signal) => (documentStatus === 'ready' ? api.getStudy(docId, signal) : undefined),
    [docId, documentStatus],
    (s) => Object.values(s.artifacts).some((a) => a.status === 'generating'),
  );
  const mounted = useMounted();
  const inflight = useRef(new Set<ArtifactKind>());

  const apply = useCallback((kind: ArtifactKind, state: ArtifactState) => {
    if (!mounted.current) return;
    setData((s) => s && { ...s, artifacts: { ...s.artifacts, [kind]: state } });
    reload(); // drops any poll that was in flight before this change, so it can't overwrite it
  }, [reload]);

  /** Starts (or restarts) generating; ignored while a generate call for this kind is in flight. */
  const generate = useCallback(async (kind: ArtifactKind) => {
    if (inflight.current.has(kind)) return;
    inflight.current.add(kind);
    try {
      apply(kind, await api.generateArtifact(docId, kind));
    } finally {
      inflight.current.delete(kind);
    }
  }, [docId, apply]);

  /** Stops a running generation; the artifact returns to its previous state ('none' if it had none). */
  const cancel = useCallback(async (kind: ArtifactKind) => {
    apply(kind, await api.cancelArtifact(docId, kind));
  }, [docId, apply]);

  return { docId, status, error, refresh: reload, generate, cancel };
}

/**
 * One step's state and payload. `payload` is the last good version: it stays while a regeneration
 * runs or fails. With `auto`, a step that was never generated starts generating once (zero-prompt),
 * so cancelling it does not restart it.
 */
export function useArtifact<K extends ArtifactKind>(study: Study, kind: K, { auto = false } = {}) {
  const { docId, generate } = study;
  const state = study.status?.artifacts[kind] ?? null;
  const status = state?.status;
  const { data, error, setError } = useLoad(
    (signal) => (status && status !== 'none' ? api.getArtifact(docId, kind, signal) : undefined),
    [docId, kind, status, state?.updatedAt],
  );
  const autoStarted = useRef(false);
  const mounted = useMounted();

  useEffect(() => {
    if (!auto || status !== 'none' || autoStarted.current) return;
    autoStarted.current = true;
    generate(kind).catch((err) => mounted.current && setError(asApiError(err)));
  }, [auto, status, kind, generate]);

  return { state, payload: data?.payload ?? null, error };
}

/** Fire-and-forget: starts generating `kind` (the step after the current one) if it was never generated. */
export function usePrefetch(study: Study, kind: ArtifactKind | undefined) {
  const status = kind && study.status?.artifacts[kind].status;
  const started = useRef(new Set<ArtifactKind>());
  const { generate } = study;

  useEffect(() => {
    if (!kind || status !== 'none' || started.current.has(kind)) return;
    started.current.add(kind);
    generate(kind).catch(() => {}); // best effort: the step auto-generates on arrival anyway
  }, [kind, status, generate]);
}

// ── SRS review ──

/** Due cards, oldest first (at most 100 at a time; `dueCount` is the full total). */
export function useDueCards(documentId?: number) {
  const { data, setData, error, reload } = useLoad((signal) => api.getDueCards(documentId, signal), [documentId]);
  const mounted = useMounted();

  /** Removes the card at once (every grade moves it at least 10 minutes ahead); puts it back if the call fails. */
  const review = useCallback(async (cardId: number, grade: SrsGrade) => {
    const card = data?.cards.find((c) => c.id === cardId);
    if (!data || !card) return;
    setData((d) => d && { cards: d.cards.filter((c) => c.id !== cardId), dueCount: d.dueCount - 1 });
    try {
      await api.reviewCard(cardId, grade);
    } catch (err) {
      if (mounted.current) setData((d) => d && { cards: [card, ...d.cards], dueCount: d.dueCount + 1 });
      throw err;
    }
    // That was the last card of this page but more are due: fetch the next page.
    if (mounted.current && data.cards.length === 1 && data.dueCount > 1) reload();
  }, [data, reload]);

  return { cards: data?.cards ?? null, dueCount: data?.dueCount ?? 0, review, error, refresh: reload };
}

// ── Quiz attempts ──

/** Past attempts, newest first. The server clears them when the quiz is regenerated: call refresh then. */
export function useQuizAttempts(docId: number) {
  const { data, setData, error, reload } = useLoad((signal) => api.listQuizAttempts(docId, signal), [docId]);
  const mounted = useMounted();

  /** One entry per question: the chosen option index, or null when skipped. Resolves with the scored attempt. */
  const submit = useCallback(async (answers: (number | null)[]) => {
    const attempt = await api.submitQuizAttempt(docId, answers);
    if (mounted.current) setData((list) => [attempt, ...(list ?? [])].slice(0, 20));
    return attempt;
  }, [docId]);

  return { attempts: data, submit, error, refresh: reload };
}

// ── Chat ──

/**
 * Document chat. `messages` is null until the history loads. `ask` appends the question at once and
 * streams the answer into the last message; on failure the partial answer is dropped and `error`
 * holds the code (e.g. chat_quota_exceeded with resetAt). The server saves both turns only when the
 * answer completes, so a stopped or failed answer is not in the history.
 */
export function useChat(docId: number) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api.getChatHistory(docId, ac.signal).then(
      // Turns asked before the history arrived are not in it yet: keep them after it.
      (history) => !ac.signal.aborted && setMessages((m) => [...history, ...(m ?? [])]),
      (err) => !ac.signal.aborted && setError(asApiError(err)),
    );
    return () => {
      ac.abort();
      active.current?.abort();
      active.current = null;
    };
  }, [docId]);

  const ask = useCallback(async (question: string) => {
    if (active.current) return; // one answer at a time
    const ac = new AbortController();
    active.current = ac;
    setError(null);
    setStreaming(true);
    setMessages((m) => {
      const prev = m ?? [];
      // A question left unanswered by a failed ask is replaced, so retrying doesn't duplicate it.
      const base = prev.at(-1)?.role === 'user' ? prev.slice(0, -1) : prev;
      return [...base, { role: 'user', content: question }, { role: 'assistant', content: '' }];
    });
    try {
      for await (const chunk of api.askChat(docId, question, ac.signal)) {
        if (ac.signal.aborted) break;
        setMessages((m) => m && [...m.slice(0, -1), { role: 'assistant', content: m.at(-1)!.content + chunk }]);
      }
    } catch (err) {
      if (ac.signal.aborted) return;
      setMessages((m) => m && m.slice(0, -1));
      setError(asApiError(err));
    } finally {
      if (active.current === ac) {
        active.current = null;
        setStreaming(false);
      }
    }
  }, [docId]);

  /** Stops the answer; text received so far stays on screen (an empty answer is dropped). */
  const stop = useCallback(() => {
    const ac = active.current;
    if (!ac) return;
    active.current = null;
    ac.abort();
    setStreaming(false);
    setMessages((m) => (m && m.at(-1)?.role === 'assistant' && !m.at(-1)!.content ? m.slice(0, -1) : m));
  }, []);

  return { messages, ask, streaming, error, stop };
}
