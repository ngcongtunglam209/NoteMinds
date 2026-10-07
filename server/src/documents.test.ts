import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { strToU8, zipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { createApp } from './app.ts';
import { openDb, type DB } from './db.ts';
import { MAX_UPLOAD_BYTES } from './documents.ts';
import { detectFormat, ocr } from './extract.ts';
import { AiError, type Llm } from './ai/llm.ts';

// Uploads start a summary; never let these tests reach a real model.
const offline: Llm = {
  complete: () => Promise.reject(new AiError('ai_unavailable', 'offline')),
  stream: () => { throw new AiError('ai_unavailable', 'offline'); },
};

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
  server = createApp(db, { rateLimits: false, llm: offline }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  alice = await register('alice');
  bob = await register('bob');
  db.prepare("UPDATE users SET plan = 'unlimited' WHERE username = 'alice'").run();
});
after(() => server.close());

async function call(method: string, path: string, cookie?: string) {
  const res = await fetch(base + path, { method, headers: cookie ? { cookie } : {} });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

async function upload(cookie: string | undefined, name: string, data: string | Uint8Array) {
  const form = new FormData();
  form.append('file', new Blob([data as BlobPart]), name); // fflate types its output as Uint8Array<ArrayBufferLike>
  const res = await fetch(`${base}/api/documents`, { method: 'POST', body: form, headers: cookie ? { cookie } : {} });
  return { status: res.status, body: await res.json() };
}

/** Uploads and waits for background extraction to finish. */
async function uploadAndWait(cookie: string, name: string, data: string | Uint8Array) {
  const r = await upload(cookie, name, data);
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.equal(r.body.document.status, 'processing');
  for (let i = 0; i < 200; i++) {
    const { body } = await call('GET', `/api/documents/${r.body.document.id}`, cookie);
    if (body.document.status !== 'processing') return body.document;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${name} never finished processing`);
}

// ── Tiny fixtures, generated here ──

// Minimal one-page PDF with a correct xref table.
function makePdf(text: string): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length + 30} >>\nstream\nBT /F1 12 Tf 10 50 Td (${text}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return strToU8(pdf);
}

const slide = (...paragraphs: string[][]) => strToU8(
  `<p:sld xmlns:a="a" xmlns:p="p"><p:txBody>${paragraphs.map((runs) =>
    `<a:p>${runs.map((r) => `<a:r><a:t>${r}</a:t></a:r>`).join('')}</a:p>`).join('')}</p:txBody></p:sld>`);

const docx = () => zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  'word/document.xml': strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Định luật Newton</w:t></w:r></w:p></w:body></w:document>'),
});

// ── Tests ──

test('uploads a text file with a Vietnamese name and stores normalized text', async () => {
  const decomposed = 'Học tập\r\nchăm chỉ'; // NFD input
  const doc = await uploadAndWait(alice, 'Bài giảng.txt', decomposed);
  assert.equal(doc.status, 'ready');
  assert.equal(doc.fileName, 'Bài giảng.txt');
  assert.equal(doc.mimeType, 'text/plain');
  assert.equal(doc.text, 'Học tập\nchăm chỉ');
  assert.equal(doc.charCount, doc.text.length);
});

test('extracts markdown, pdf, docx, pptx and xlsx', async () => {
  assert.equal((await uploadAndWait(alice, 'notes.md', '# Title\n\nBody')).text, '# Title\n\nBody');

  const pdf = await uploadAndWait(alice, 'lecture.pdf', makePdf('Hello PDF world'));
  assert.deepEqual([pdf.status, pdf.mimeType], ['ready', 'application/pdf']);
  assert.match(pdf.text, /Hello PDF world/);

  assert.match((await uploadAndWait(alice, 'essay.docx', docx())).text, /Định luật Newton/);

  const pptx = zipSync({
    'ppt/slides/slide10.xml': slide(['Last']),
    'ppt/slides/slide2.xml': slide(['Hel', 'lo'], ['Tom &amp; Jerry']),
    'ppt/presentation.xml': strToU8('<p:presentation/>'),
  });
  assert.equal((await uploadAndWait(alice, 'deck.pptx', pptx)).text,
    '--- Slide 1 ---\nHello\nTom & Jerry\n\n--- Slide 2 ---\nLast');

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Từ', 'Nghĩa'], ['cat', 'mèo']]), 'Vocab');
  const xlsx = await uploadAndWait(alice, 'vocab.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(xlsx.text, '=== Sheet: Vocab ===\nTừ\tNghĩa\ncat\tmèo');
});

test('broken or empty files finish as failed with a code', async () => {
  const corrupt = await uploadAndWait(alice, 'broken.docx', zipSync({ 'junk.txt': strToU8('x') }));
  assert.deepEqual([corrupt.status, corrupt.error], ['failed', 'extraction_failed']);
  const binary = await uploadAndWait(alice, 'binary.txt', new Uint8Array([0xff, 0xfe, 0x00, 0xc3]));
  assert.deepEqual([binary.status, binary.error], ['failed', 'extraction_failed']);
  const empty = await uploadAndWait(alice, 'blank.md', '  \n\n ');
  assert.deepEqual([empty.status, empty.error, empty.text], ['failed', 'no_text', '']);
});

test('rejects unsupported types, mismatched magic bytes, audio and oversized files', async () => {
  for (const [name, data] of [['virus.exe', 'MZ'], ['fake.pdf', 'not a pdf'], ['fake.png', 'hello'], ['old.doc', 'x']] as const) {
    const r = await upload(alice, name, data);
    assert.deepEqual([r.status, r.body.error], [415, 'unsupported_file'], name);
  }
  const audio = await upload(alice, 'lecture.mp3', 'ID3');
  assert.deepEqual([audio.status, audio.body.error], [415, 'audio_unsupported']);

  const big = await upload(alice, 'big.txt', new Uint8Array(MAX_UPLOAD_BYTES + 1));
  assert.deepEqual([big.status, big.body.error], [413, 'file_too_large']);

  const noFile = await fetch(`${base}/api/documents`, { method: 'POST', headers: { cookie: alice } });
  assert.deepEqual([noFile.status, (await noFile.json()).error], [400, 'invalid_input']);
});

test('images are routed to OCR (not run: tesseract fetches language data over the network)', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  assert.equal((detectFormat('scan.PNG', png) as { parse: unknown }).parse, ocr);
  assert.equal((detectFormat('photo.jpeg', jpeg) as { parse: unknown }).parse, ocr);
  assert.equal(detectFormat('photo.jpg', png), null);
});

test('list is newest first without text; get and delete are owner-only', async () => {
  const doc = await uploadAndWait(alice, 'mine.txt', 'private notes');

  const list = await call('GET', '/api/documents', alice);
  assert.equal(list.status, 200);
  assert.equal(list.body.documents[0].id, doc.id);
  assert.ok(list.body.documents.every((d: object) => !('text' in d)));
  assert.deepEqual((await call('GET', '/api/documents', bob)).body.documents, []);

  assert.equal((await call('GET', `/api/documents/${doc.id}`, bob)).status, 404);
  assert.equal((await call('DELETE', `/api/documents/${doc.id}`, bob)).status, 404);
  assert.equal((await call('GET', '/api/documents/abc', alice)).status, 404);

  assert.equal((await call('DELETE', `/api/documents/${doc.id}`, alice)).status, 204);
  assert.equal((await call('GET', `/api/documents/${doc.id}`, alice)).status, 404);
  assert.equal((await call('DELETE', `/api/documents/${doc.id}`, alice)).status, 404);
});

test('requires a session', async () => {
  assert.equal((await call('GET', '/api/documents')).status, 401);
  assert.equal((await call('GET', '/api/documents/1')).status, 401);
  assert.equal((await upload(undefined, 'a.txt', 'x')).status, 401);
});

test('free plan gets 5 uploads a day; deleting does not refund quota', async () => {
  const carol = await register('carol');
  for (let i = 0; i < 5; i++) {
    const r = await upload(carol, `n${i}.txt`, 'note');
    assert.equal(r.status, 202);
    if (i === 0) assert.equal((await call('DELETE', `/api/documents/${r.body.document.id}`, carol)).status, 204);
  }
  const r = await upload(carol, 'n5.txt', 'note');
  assert.equal(r.status, 429);
  assert.equal(r.body.error, 'quota_exceeded');
  const resetAt = new Date(r.body.resetAt);
  assert.equal(resetAt.toISOString(), r.body.resetAt);
  assert.ok(resetAt.getTime() > Date.now() && resetAt.getTime() <= Date.now() + 24 * 60 * 60 * 1000);
  assert.equal(resetAt.getUTCHours(), 0);

  // Rejected files don't consume quota.
  const bobUploads = () => (db.prepare(
    "SELECT COUNT(*) AS n FROM upload_events e JOIN users u ON u.id = e.user_id WHERE u.username = 'bob'").get() as { n: number }).n;
  const before = bobUploads();
  assert.equal((await upload(bob, 'x.exe', 'MZ')).status, 415);
  assert.equal(bobUploads(), before);
});
