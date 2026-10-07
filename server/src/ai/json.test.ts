import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLlmJson } from './json.ts';

test('parses JSON wrapped in code fences and prose', () => {
  assert.deepEqual(parseLlmJson('Here you go:\n```json\n{"a": 1}\n```\nHope this helps!'), { a: 1 });
  assert.deepEqual(parseLlmJson('Sure! {"a": [1, 2]} Let me know.'), { a: [1, 2] });
  assert.deepEqual(parseLlmJson('<think>{"draft": true}</think>\n{"a": 1}'), { a: 1 });
  assert.deepEqual(parseLlmJson('﻿{"a": "xin chào"}'), { a: 'xin chào' });
});

test('repairs trailing commas, unquoted keys and comment lines, but keeps URLs', () => {
  assert.deepEqual(parseLlmJson('{title: "T", cards: [{"q": "x",},],}'), { title: 'T', cards: [{ q: 'x' }] });
  assert.deepEqual(
    parseLlmJson('{\n  // the source\n  "url": "https://notemind.tech/a",\n}'),
    { url: 'https://notemind.tech/a' },
  );
});

test('recovers the complete items of output truncated mid-array', () => {
  const truncated = '{"title": "Sinh học", "cards": [{"question": "ADN là gì?", "answer": "Axit {nucleic}"}, {"question": "ARN';
  assert.deepEqual(parseLlmJson(truncated), {
    title: 'Sinh học',
    cards: [{ question: 'ADN là gì?', answer: 'Axit {nucleic}' }],
  });
  assert.deepEqual(parseLlmJson('```json\n{"a": [1, 2], "b": {"c": 3'), { a: [1, 2] });
});

test('throws ai_bad_output when there is no JSON at all', () => {
  assert.throws(() => parseLlmJson('Xin lỗi, tôi không thể giúp.'), { code: 'ai_bad_output' });
  assert.throws(() => parseLlmJson('{"a": '), { code: 'ai_bad_output' });
});
