import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from './app.ts';
import { openDb, type DB } from './db.ts';
import { AiError, type Llm, type LlmRequest } from './ai/llm.ts';
import type { ArtifactKind } from '../../shared/study-api.ts';

// ── Fake model: replies by task, overridable per test ──

type Reply = (req: LlmRequest) => string | Promise<string>;

const deck = (n: number) => ({ title: 'Quang hợp', cards: Array.from({ length: n }, (_, i) => ({ question: `Câu ${i}?`, answer: `Đáp ${i}`, tag: 'Định nghĩa' })) });
const quiz = {
  title: 'Kiểm tra',
  questions: [
    { question: 'Sản phẩm của quang hợp?', options: ['Glucozơ', 'Muối', 'Đạm', 'Sắt'], correctIndex: 0, explanation: 'Theo tài liệu.' },
    { question: 'Nơi diễn ra?', options: ['Rễ', 'Lục lạp', 'Thân', 'Hoa'], correctIndex: 1, explanation: 'Theo tài liệu.' },
  ],
};
const FIXTURES: Record<ArtifactKind, Reply> = {
  summary: () => JSON.stringify({ title: 'Quang hợp', markdown: '## Ý chính\n- **Quang hợp** tạo chất hữu cơ' }),
  mindmap: () => JSON.stringify({ title: 'Quang hợp', root: { label: 'Quang hợp', children: [{ label: 'Pha sáng' }] } }),
  flashcards: () => JSON.stringify(deck(3)),
  quiz: () => JSON.stringify(quiz),
};

const kindOf = (req: LlmRequest): ArtifactKind => {
  const system = req.messages[0]?.content ?? '';
  if (system.includes('study summary')) return 'summary';
  if (system.includes('mind map')) return 'mindmap';
  return system.includes('flashcards') ? 'flashcards' : 'quiz';
};

/** Never answers; rejects when the request's signal aborts. */
const hang: Reply = (req) => new Promise((_, reject) => {
  const onAbort = () => reject(req.signal!.reason);
  if (req.signal!.aborted) onAbort();
  else req.signal!.addEventListener('abort', onAbort);
});

let replies: Partial<Record<ArtifactKind, Reply>> = {};
let chatStream: (req: LlmRequest) => AsyncIterable<string>;
let calls: { kind: ArtifactKind; signal?: AbortSignal }[] = [];
const defaultChat = async function* () { yield* ['Quang hợp ', 'tạo ', 'glucozơ.']; };

const llm: Llm = {
  async complete(req) {
    const kind = kindOf(req);
    calls.push({ kind, signal: req.signal });
    return (replies[kind] ?? FIXTURES[kind])(req);
  },
  stream: (req) => chatStream(req),
};

beforeEach(() => {
  replies = {};
  chatStream = defaultChat;
  calls = [];
});

// ── HTTP helpers ──

let db: DB;
let server: Server;
let base: string;
let alice: string;
let bob: string;

async function register(username: string) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@example.com`, password: 'correct horse' }),
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0]!;
}

before(async () => {
  db = openDb(':memory:');
  server = createApp(db, { rateLimits: false, llm }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  alice = await register('alice');
  bob = await register('bob');
  db.prepare("UPDATE users SET plan = 'unlimited' WHERE username = 'alice'").run();
});
after(() => server.close());

async function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = cookie ? { cookie } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const json = res.headers.get('content-type')?.startsWith('application/json');
  return { status: res.status, body: json ? JSON.parse(text) : text };
}

const until = async <T>(check: () => Promise<T | undefined>, what: string): Promise<T> => {
  for (let i = 0; i < 200; i++) {
    const value = await check();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
};

/** Uploads a text document and waits for extraction. */
async function uploadDoc(cookie: string, text = 'Quang hợp là quá trình cây xanh dùng ánh sáng để tạo chất hữu cơ.', name = 'bai1.txt') {
  const form = new FormData();
  form.append('file', new Blob([text]), name);
  const res = await fetch(`${base}/api/documents`, { method: 'POST', body: form, headers: { cookie } });
  const { document } = await res.json();
  return until(async () => {
    const { body } = await call('GET', `/api/documents/${document.id}`, cookie);
    return body.document.status === 'processing' ? undefined : (body.document as { id: number; status: string });
  }, 'extraction');
}

/** Waits until the artifact leaves 'generating' and returns its full response. */
async function settled(cookie: string, docId: number, kind: ArtifactKind) {
  return until(async () => {
    const { body } = await call('GET', `/api/documents/${docId}/study/${kind}`, cookie);
    return body.status === 'generating' ? undefined : body;
  }, `${kind} to settle`);
}

// ── Tests ──

test('summary is generated automatically when a document is ready; nothing else is', async () => {
  const doc = await uploadDoc(alice);
  const summary = await settled(alice, doc.id, 'summary');
  assert.equal(summary.status, 'ready');
  assert.equal(summary.error, null);
  assert.deepEqual(summary.payload, { title: 'Quang hợp', markdown: '## Ý chính\n- **Quang hợp** tạo chất hữu cơ' });
  assert.deepEqual(calls.map((c) => c.kind), ['summary']);

  const { status, body } = await call('GET', `/api/documents/${doc.id}/study`, alice);
  assert.equal(status, 200);
  assert.equal(body.artifacts.summary.status, 'ready');
  for (const kind of ['mindmap', 'flashcards', 'quiz']) {
    assert.deepEqual(body.artifacts[kind], { status: 'none', error: null, updatedAt: null });
  }
  assert.equal(body.dueCount, 0);
  assert.deepEqual((await call('GET', `/api/documents/${doc.id}/study/quiz`, alice)).body.payload, null);
});

test('on-demand generation and regeneration; flashcards become due cards, replaced on regenerate', async () => {
  const doc = await uploadDoc(alice);
  await settled(alice, doc.id, 'summary');

  const started = await call('POST', `/api/documents/${doc.id}/study/mindmap`, alice);
  assert.deepEqual([started.status, started.body.status], [202, 'generating']);
  const mindmap = await settled(alice, doc.id, 'mindmap');
  assert.equal(mindmap.status, 'ready');
  assert.deepEqual(mindmap.payload.nodes.map((n: { label: string }) => n.label), ['Quang hợp', 'Pha sáng']);

  assert.equal((await call('POST', `/api/documents/${doc.id}/study/flashcards`, alice)).status, 202);
  assert.equal((await settled(alice, doc.id, 'flashcards')).payload.cards.length, 3);
  assert.equal((await call('GET', `/api/documents/${doc.id}/study`, alice)).body.dueCount, 3);

  replies.flashcards = () => JSON.stringify(deck(5));
  assert.equal((await call('POST', `/api/documents/${doc.id}/study/flashcards`, alice)).status, 202);
  assert.equal((await settled(alice, doc.id, 'flashcards')).payload.cards.length, 5);
  const due = await call('GET', `/api/review/due?documentId=${doc.id}`, alice);
  assert.equal(due.body.dueCount, 5);
  assert.deepEqual(due.body.cards.map((c: { question: string }) => c.question), ['Câu 0?', 'Câu 1?', 'Câu 2?', 'Câu 3?', 'Câu 4?']);
  assert.equal(due.body.cards[0].documentId, doc.id);
  assert.equal(due.body.cards[0].tag, 'Định nghĩa');
});

test('cancel stops the LLM call and restores the previous state, or none', async () => {
  const doc = await uploadDoc(alice);
  await settled(alice, doc.id, 'summary');

  // Regenerating a ready summary: the old payload stays visible, and comes back as ready on cancel.
  replies.summary = hang;
  assert.equal((await call('POST', `/api/documents/${doc.id}/study/summary`, alice)).status, 202);
  const during = await call('GET', `/api/documents/${doc.id}/study/summary`, alice);
  assert.equal(during.body.status, 'generating');
  assert.equal(during.body.payload.title, 'Quang hợp');
  const cancelled = await call('DELETE', `/api/documents/${doc.id}/study/summary/run`, alice);
  assert.deepEqual([cancelled.status, cancelled.body.status], [200, 'ready']);
  assert.equal(calls.at(-1)?.signal?.aborted, true);
  assert.equal((await call('GET', `/api/documents/${doc.id}/study/summary`, alice)).body.payload.title, 'Quang hợp');

  // First generation of a kind goes back to none.
  replies.quiz = hang;
  await call('POST', `/api/documents/${doc.id}/study/quiz`, alice);
  assert.equal((await call('DELETE', `/api/documents/${doc.id}/study/quiz/run`, alice)).body.status, 'none');
  await new Promise((resolve) => setTimeout(resolve, 20)); // the aborted run must not write anything back
  assert.equal((await call('GET', `/api/documents/${doc.id}/study`, alice)).body.artifacts.quiz.status, 'none');

  // Cancelling when nothing runs is a no-op.
  assert.equal((await call('DELETE', `/api/documents/${doc.id}/study/quiz/run`, alice)).body.status, 'none');
});

test('failed generation keeps its error code; documents that are too long fail with document_too_long', async () => {
  const doc = await uploadDoc(alice);
  await settled(alice, doc.id, 'summary');
  replies.quiz = () => 'not json';
  await call('POST', `/api/documents/${doc.id}/study/quiz`, alice);
  const failed = await settled(alice, doc.id, 'quiz');
  assert.deepEqual([failed.status, failed.error, failed.payload], ['failed', 'ai_bad_output', null]);

  const long = await uploadDoc(alice, 'chữ '.repeat(60_000), 'dai.txt');
  assert.equal(long.status, 'ready');
  const summary = await settled(alice, long.id, 'summary');
  assert.deepEqual([summary.status, summary.error], ['failed', 'document_too_long']);
});

test('a restart turns generating artifacts into failed ai_unavailable', async () => {
  const doc = await uploadDoc(alice);
  await settled(alice, doc.id, 'summary');
  db.prepare("INSERT INTO artifacts (document_id, kind, status) VALUES (?, 'mindmap', 'generating')").run(doc.id);
  createApp(db, { rateLimits: false, llm }); // boot again on the same database
  const mindmap = (await call('GET', `/api/documents/${doc.id}/study/mindmap`, alice)).body;
  assert.deepEqual([mindmap.status, mindmap.error], ['failed', 'ai_unavailable']);
});

test('review updates the SM-2 schedule; due counts span all documents', async () => {
  const dave = await register('dave');
  const docs = [await uploadDoc(dave), await uploadDoc(dave)];
  for (const doc of docs) {
    await settled(dave, doc.id, 'summary');
    await call('POST', `/api/documents/${doc.id}/study/flashcards`, dave);
    await settled(dave, doc.id, 'flashcards');
  }
  const all = (await call('GET', '/api/review/due', dave)).body;
  assert.equal(all.dueCount, 6);
  const card = all.cards[0];
  assert.deepEqual([card.ease, card.intervalDays, card.reps], [2.5, 0, 0]);

  const reviewed = await call('POST', `/api/cards/${card.id}/review`, dave, { grade: 'good' });
  assert.equal(reviewed.status, 200);
  assert.deepEqual([reviewed.body.card.intervalDays, reviewed.body.card.reps, reviewed.body.card.ease], [1, 1, 2.5]);
  const inADay = new Date(reviewed.body.card.dueAt).getTime() - Date.now();
  assert.ok(Math.abs(inADay - 24 * 60 * 60 * 1000) < 60_000);

  assert.equal((await call('GET', '/api/review/due', dave)).body.dueCount, 5);
  assert.equal((await call('GET', `/api/documents/${card.documentId}/study`, dave)).body.dueCount, 2);

  const again = await call('POST', `/api/cards/${card.id}/review`, dave, { grade: 'again' });
  assert.deepEqual([again.body.card.intervalDays, again.body.card.reps], [0, 0]);

  assert.equal((await call('POST', `/api/cards/${card.id}/review`, dave, { grade: 'perfect' })).status, 400);
  assert.equal((await call('POST', '/api/cards/999999/review', dave, { grade: 'good' })).status, 404);
  assert.equal((await call('GET', '/api/review/due?documentId=x', dave)).status, 400);
});

test('quiz attempts are scored, listed newest first, and cleared when the quiz is regenerated', async () => {
  const doc = await uploadDoc(alice);
  await settled(alice, doc.id, 'summary');
  assert.equal((await call('POST', `/api/documents/${doc.id}/quiz/attempts`, alice, { answers: [0, 1] })).status, 404);

  await call('POST', `/api/documents/${doc.id}/study/quiz`, alice);
  await settled(alice, doc.id, 'quiz');
  const first = await call('POST', `/api/documents/${doc.id}/quiz/attempts`, alice, { answers: [0, 2] });
  assert.equal(first.status, 201);
  assert.deepEqual([first.body.attempt.score, first.body.attempt.total, first.body.attempt.answers], [1, 2, [0, 2]]);
  const second = await call('POST', `/api/documents/${doc.id}/quiz/attempts`, alice, { answers: [0, 1] });
  assert.equal(second.body.attempt.score, 2);
  const skipped = await call('POST', `/api/documents/${doc.id}/quiz/attempts`, alice, { answers: [null, null] });
  assert.equal(skipped.body.attempt.score, 0);

  const list = (await call('GET', `/api/documents/${doc.id}/quiz/attempts`, alice)).body.attempts;
  assert.deepEqual(list.map((a: { score: number }) => a.score), [0, 2, 1]);

  for (const answers of [[0], [0, 1, 2], [0, 4], 'a']) {
    assert.equal((await call('POST', `/api/documents/${doc.id}/quiz/attempts`, alice, { answers })).status, 400);
  }

  await call('POST', `/api/documents/${doc.id}/study/quiz`, alice);
  await settled(alice, doc.id, 'quiz');
  assert.deepEqual((await call('GET', `/api/documents/${doc.id}/quiz/attempts`, alice)).body.attempts, []);
});

test('chat streams plain text, persists both turns and sends recent history to the model', async () => {
  const doc = await uploadDoc(alice);
  await settled(alice, doc.id, 'summary');

  const res = await fetch(`${base}/api/documents/${doc.id}/chat`, {
    method: 'POST',
    headers: { cookie: alice, 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'Quang hợp tạo ra gì?' }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(await res.text(), 'Quang hợp tạo glucozơ.');

  const history = (await call('GET', `/api/documents/${doc.id}/chat`, alice)).body.messages;
  assert.deepEqual(history, [
    { role: 'user', content: 'Quang hợp tạo ra gì?' },
    { role: 'assistant', content: 'Quang hợp tạo glucozơ.' },
  ]);

  let sent: LlmRequest | undefined;
  chatStream = async function* (req) { sent = req; yield 'Ở lục lạp.'; };
  await call('POST', `/api/documents/${doc.id}/chat`, alice, { question: 'Ở đâu?' });
  assert.deepEqual(sent!.messages.slice(1).map((m) => m.content), ['Quang hợp tạo ra gì?', 'Quang hợp tạo glucozơ.', 'Ở đâu?']);
  assert.equal((await call('GET', `/api/documents/${doc.id}/chat`, alice)).body.messages.length, 4);

  assert.equal((await call('POST', `/api/documents/${doc.id}/chat`, alice, { question: '  ' })).status, 400);
});

test('chat: AI failure maps to 503 and is not saved; a client disconnect aborts the model call', async () => {
  const doc = await uploadDoc(alice);
  await settled(alice, doc.id, 'summary');

  chatStream = () => { throw new AiError('ai_unavailable', 'down'); };
  const failed = await call('POST', `/api/documents/${doc.id}/chat`, alice, { question: 'Hỏi?' });
  assert.deepEqual([failed.status, failed.body.error], [503, 'ai_unavailable']);

  let modelSignal: AbortSignal | undefined;
  chatStream = async function* (req) {
    modelSignal = req.signal;
    yield 'Một ';
    await hang(req);
  };
  const ac = new AbortController();
  const res = await fetch(`${base}/api/documents/${doc.id}/chat`, {
    method: 'POST',
    headers: { cookie: alice, 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'Hỏi?' }),
    signal: ac.signal,
  });
  const reader = res.body!.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'Một ');
  ac.abort();
  await until(async () => (modelSignal?.aborted ? true : undefined), 'the model call to abort');
  assert.deepEqual((await call('GET', `/api/documents/${doc.id}/chat`, alice)).body.messages, []);
});

test('chat quota: free plan gets 10 questions a day, failures are refunded', async () => {
  const carol = await register('carol');
  const doc = await uploadDoc(carol);
  await settled(carol, doc.id, 'summary');
  const carolId = (db.prepare("SELECT id FROM users WHERE username = 'carol'").get() as { id: number }).id;
  for (let i = 0; i < 9; i++) db.prepare('INSERT INTO chat_events (user_id) VALUES (?)').run(carolId);

  chatStream = () => { throw new AiError('ai_unavailable', 'down'); };
  assert.equal((await call('POST', `/api/documents/${doc.id}/chat`, carol, { question: 'Hỏi?' })).status, 503);
  chatStream = defaultChat;
  assert.equal((await call('POST', `/api/documents/${doc.id}/chat`, carol, { question: 'Hỏi?' })).status, 200);

  const r = await call('POST', `/api/documents/${doc.id}/chat`, carol, { question: 'Hỏi nữa?' });
  assert.equal(r.status, 429);
  assert.equal(r.body.error, 'chat_quota_exceeded');
  const resetAt = new Date(r.body.resetAt);
  assert.equal(resetAt.getUTCHours(), 0);
  assert.ok(resetAt.getTime() > Date.now() && resetAt.getTime() <= Date.now() + 24 * 60 * 60 * 1000);
});

test("other users' documents and cards are 404; failed documents are 409", async () => {
  const doc = await uploadDoc(alice);
  await settled(alice, doc.id, 'summary');
  await call('POST', `/api/documents/${doc.id}/study/flashcards`, alice);
  await settled(alice, doc.id, 'flashcards');
  const cardId = (await call('GET', `/api/review/due?documentId=${doc.id}`, alice)).body.cards[0].id;

  const d = `/api/documents/${doc.id}`;
  for (const [method, path, body] of [
    ['GET', `${d}/study`], ['GET', `${d}/study/summary`], ['POST', `${d}/study/quiz`], ['DELETE', `${d}/study/quiz/run`],
    ['GET', `${d}/chat`], ['POST', `${d}/chat`, { question: 'Hỏi?' }],
    ['GET', `${d}/quiz/attempts`], ['POST', `${d}/quiz/attempts`, { answers: [0, 1] }],
    ['POST', `/api/cards/${cardId}/review`, { grade: 'good' }],
  ] as [string, string, unknown?][]) {
    assert.equal((await call(method, path, bob, body)).status, 404, `${method} ${path}`);
  }
  assert.deepEqual((await call('GET', `/api/review/due?documentId=${doc.id}`, bob)).body, { cards: [], dueCount: 0 });
  assert.equal((await call('GET', `${d}/study/notes`, alice)).status, 404);

  const blank = await uploadDoc(alice, '   ', 'blank.txt');
  assert.equal(blank.status, 'failed');
  assert.equal((await call('POST', `/api/documents/${blank.id}/study/quiz`, alice)).status, 409);
  assert.equal((await call('POST', `/api/documents/${blank.id}/chat`, alice, { question: 'Hỏi?' })).status, 409);
});

test('requires a session', async () => {
  for (const [method, path] of [
    ['GET', '/api/documents/1/study'], ['POST', '/api/documents/1/study/summary'], ['GET', '/api/documents/1/chat'],
    ['GET', '/api/review/due'], ['POST', '/api/cards/1/review'],
  ] as const) {
    assert.equal((await call(method, path)).status, 401, `${method} ${path}`);
  }
});
