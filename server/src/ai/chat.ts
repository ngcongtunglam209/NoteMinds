import type { ChatMessage, StudyLanguage } from '../../../shared/study.ts';
import type { Llm } from './llm.ts';
import { chunk, detectLanguage, documentMessage, fit, guard, prepareDocument, systemPrompt } from './prompt.ts';

export interface ChatOptions {
  question: string;
  history?: ChatMessage[];
  language?: StudyLanguage;
  signal?: AbortSignal;
}

const BUDGET_CHARS = 12_000;
const PASSAGE_CHARS = 1_500;
const HISTORY_TURNS = 10;

const TASK = `TASK: Answer the learner's questions using the document.
- Ground every answer in the document. If the document does not cover the question, say so clearly, then answer briefly from general knowledge only if that helps the learner.
- Be concise and structured; use bullet points and Markdown when helpful.
- If the learner writes in another language, answer in their language.`;

/**
 * Long documents don't fit the prompt, so pick the passages that share the most words with the
 * question (and the previous question, for follow-ups like "explain more"), in document order.
 * The opening passage always stays: it usually names the topic.
 */
// ponytail: word-overlap retrieval, no embeddings. Upgrade to an embedding index if answers on
// long documents miss passages that use different wording than the question.
export function selectPassages(text: string, query: string, budget = BUDGET_CHARS): string {
  if (text.length <= budget) return text;
  const terms = new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
  const passages = chunk(text, PASSAGE_CHARS);
  const scores = passages.map((p, i) => {
    const words = new Set(p.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
    return { i, score: i === 0 ? Infinity : [...terms].filter((t) => words.has(t)).length };
  });
  if (!scores.some((s) => s.i > 0 && s.score > 0)) return fit(text, budget); // nothing matched: sample evenly

  const picked: number[] = [];
  let used = 0;
  for (const { i } of scores.sort((a, b) => b.score - a.score)) {
    if (used + passages[i].length > budget) continue;
    picked.push(i);
    used += passages[i].length;
  }
  return picked.sort((a, b) => a - b).map((i) => passages[i]).join('\n\n[…]\n\n');
}

/** Streams the answer as text chunks. Throws document_too_long before any request is made. */
export function chat(llm: Llm, documentText: string, options: ChatOptions): AsyncIterable<string> {
  const text = prepareDocument(documentText);
  const language = options.language ?? detectLanguage(text);
  const question = guard(options.question.trim().slice(0, 2000));
  const history = (options.history ?? []).slice(-HISTORY_TURNS).map((m) => ({
    role: m.role,
    content: m.role === 'user' ? guard(m.content.slice(0, 3000)) : m.content,
  }));
  const lastQuestion = history.findLast((m) => m.role === 'user')?.content ?? '';

  return llm.stream({
    messages: [
      { role: 'system', content: `${systemPrompt(TASK, language)}\n\n${documentMessage(selectPassages(text, `${question} ${lastQuestion}`))}` },
      ...history,
      { role: 'user', content: question },
    ],
    temperature: 0.7,
    maxTokens: 2048,
    signal: options.signal,
  });
}
