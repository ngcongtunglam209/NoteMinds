import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { unzipSync } from 'fflate';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import Tesseract from 'tesseract.js';
import * as XLSX from 'xlsx';

// Caps so one upload can't stall the process or blow up memory (text is stored and later sent to the AI).
const MAX_TEXT_CHARS = 500_000;
const MAX_PDF_PAGES = 300;
const MAX_SHEET_ROWS = 5000;
const MAX_ZIP_ENTRY_BYTES = 20 * 1024 * 1024;

export interface Format {
  mime: string;
  parse: (data: Buffer) => Promise<string>;
}

// ── Parsers ──

async function parseText(data: Buffer): Promise<string> {
  return new TextDecoder('utf-8', { fatal: true }).decode(data); // throws on binary / non-UTF-8 input
}

async function parsePdf(data: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    const { text } = await parser.getText({ first: MAX_PDF_PAGES, pageJoiner: '' });
    return text.replace(/\f/g, '\n\n').replace(/[ \t]+/g, ' ');
  } finally {
    await parser.destroy();
  }
}

async function parseDocx(data: Buffer): Promise<string> {
  return (await mammoth.extractRawText({ buffer: data })).value;
}

const decodeXml = (s: string) =>
  s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (_m, hex, dec, name) =>
    hex ? String.fromCodePoint(parseInt(hex, 16))
      : dec ? String.fromCodePoint(Number(dec))
        : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[name.toLowerCase()]);

// PPTX is a zip of slide XML files; text lives in <a:t> runs grouped into <a:p> paragraphs.
async function parsePptx(data: Buffer): Promise<string> {
  const files = unzipSync(data, {
    // ponytail: originalSize is the zip header's claim; the 50MB upload cap bounds the rest
    filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) && f.originalSize <= MAX_ZIP_ENTRY_BYTES,
  });
  const slideNo = (name: string) => Number(name.match(/(\d+)\.xml$/)![1]);
  const slides = Object.keys(files).sort((a, b) => slideNo(a) - slideNo(b)).map((name) => {
    const xml = new TextDecoder().decode(files[name]);
    const paragraphs = xml.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? [];
    return paragraphs
      .map((p) => [...p.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1]!)).join('').trim())
      .filter(Boolean)
      .join('\n');
  }).filter(Boolean);
  return slides.map((text, i) => `--- Slide ${i + 1} ---\n${text}`).join('\n\n');
}

async function parseXlsx(data: Buffer): Promise<string> {
  const book = XLSX.read(data, { type: 'buffer', sheetRows: MAX_SHEET_ROWS });
  return book.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(book.Sheets[name]!, { FS: '\t', blankrows: false }).trim();
    return csv && `=== Sheet: ${name} ===\n${csv}`;
  }).filter(Boolean).join('\n\n');
}

// Each recognize() spins up a worker (~100-300MB) and fetches vie+eng language data on first use.
// ponytail: one OCR at a time via a promise chain; a job queue/worker pool if OCR volume grows
let ocrTail: Promise<unknown> = Promise.resolve();
export function ocr(data: Buffer): Promise<string> {
  const run = ocrTail.then(async () =>
    (await Tesseract.recognize(data, 'vie+eng', { cachePath: join(tmpdir(), 'notemind-ocr') })).data.text);
  ocrTail = run.catch(() => {});
  return run;
}

// ── Detection: extension picks the parser, magic bytes must agree (client mime is ignored) ──

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // PK\3\4 (docx/pptx/xlsx)
const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];

const FORMATS: Record<string, Format & { magic?: number[] }> = {
  '.pdf': { mime: 'application/pdf', magic: PDF, parse: parsePdf },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: ZIP, parse: parseDocx },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', magic: ZIP, parse: parsePptx },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: ZIP, parse: parseXlsx },
  '.txt': { mime: 'text/plain', parse: parseText },
  '.md': { mime: 'text/markdown', parse: parseText },
  '.csv': { mime: 'text/csv', parse: parseText },
  '.png': { mime: 'image/png', magic: PNG, parse: ocr },
  '.jpg': { mime: 'image/jpeg', magic: JPEG, parse: ocr },
  '.jpeg': { mime: 'image/jpeg', magic: JPEG, parse: ocr },
};

// Legacy accepted these but transcription needs DashScope's multi-step async ASR API; deferred.
const AUDIO = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.webm']);

/** Picks the parser for an upload, or says why it can't. */
export function detectFormat(fileName: string, data: Buffer): Format | 'audio' | null {
  const ext = extname(fileName).toLowerCase();
  if (AUDIO.has(ext)) return 'audio';
  const format = FORMATS[ext];
  if (!format || (format.magic && !format.magic.every((b, i) => data[i] === b))) return null;
  return format;
}

/** Extracts plain text, normalized for storage. Empty string means the file had no text. */
export async function extractText(format: Format, data: Buffer): Promise<string> {
  return (await format.parse(data))
    .normalize('NFC') // Vietnamese diacritics come in both composed and decomposed forms
    .replace(/\r\n?/g, '\n')
    .replace(/\0/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}
