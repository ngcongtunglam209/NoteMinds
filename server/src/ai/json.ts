import { z } from 'zod';
import { AiError, type Llm, type LlmMessage } from './llm.ts';

// Getting typed JSON out of an LLM: tolerant parsing, zod validation, one retry.

/**
 * Parses JSON the way models actually emit it: wrapped in ``` fences or <think> blocks, with
 * prose around it, trailing commas, unquoted keys, or cut off by max_tokens mid-array.
 */
export function parseLlmJson(raw: string): unknown {
  let text = raw.replace(/[​-‍﻿]/g, '').replace(/<think>[\s\S]*?<\/think>/g, '');
  text = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/)?.[1] ?? text;
  const start = text.search(/[{[]/);
  if (start === -1) throw new AiError('ai_bad_output', 'No JSON in LLM output');
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  const candidates = [text.slice(start, end + 1), text.slice(start)];

  for (const candidate of candidates) {
    for (const attempt of [candidate, repair(candidate)]) {
      try {
        return JSON.parse(attempt);
      } catch {}
    }
  }
  const truncated = closeTruncated(text.slice(start)) ?? closeTruncated(repair(text.slice(start)));
  if (truncated !== undefined) return truncated;
  throw new AiError('ai_bad_output', 'LLM output is not valid JSON');
}

function repair(json: string): string {
  return json
    .replace(/^\s*\/\/.*$/gm, '') // whole-line comments only; "//" inside URLs must survive
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":') // unquoted keys
    .replace(/,\s*([}\]])/g, '$1'); // trailing commas
}

/**
 * Output cut off by max_tokens: back up to the last closed object/array and close every bracket
 * still open, so 14 complete flashcards survive instead of failing on the half-written 15th.
 */
function closeTruncated(json: string): unknown {
  const closers = [...json.matchAll(/[}\]]/g)].map((m) => m.index).reverse().slice(0, 200);
  for (const at of closers) {
    const head = json.slice(0, at + 1);
    const open = unclosedBrackets(head);
    if (open === undefined) continue;
    try {
      return JSON.parse(head + open);
    } catch {}
  }
  return undefined;
}

/** The closing brackets `head` still needs, or undefined if it ends inside a string. */
function unclosedBrackets(head: string): string | undefined {
  const stack: string[] = [];
  let inString = false;
  for (let i = 0; i < head.length; i++) {
    const ch = head[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return inString ? undefined : stack.reverse().join('');
}

/** An array that drops malformed items instead of failing the whole set, but needs `min` good ones. */
export function lenientArray<T>(item: z.ZodType<T>, min = 1) {
  return z
    .array(z.unknown())
    .transform((items) => items.flatMap((i) => {
      const parsed = item.safeParse(i);
      return parsed.success ? [parsed.data] : [];
    }))
    .refine((items) => items.length >= min, { message: `Expected at least ${min} valid items` });
}

/** JSON-mode completion validated by `schema`; malformed output gets one retry, then ai_bad_output. */
export async function generateJson<T>(
  llm: Llm,
  messages: LlmMessage[],
  schema: z.ZodType<T>,
  { temperature = 0.5, maxTokens = 4096 } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await llm.complete({ messages, json: true, temperature, maxTokens });
    try {
      return schema.parse(parseLlmJson(text));
    } catch (err) {
      lastError = err;
    }
  }
  throw new AiError('ai_bad_output', 'LLM output did not match the expected shape', { cause: lastError });
}
