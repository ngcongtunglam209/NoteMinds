import { z } from 'zod';
import type { Summary } from '../../../shared/study.ts';
import type { Llm } from './llm.ts';
import { generateJson } from './json.ts';
import { chunk, detectLanguage, documentMessage, prepareDocument, systemPrompt, type GenerateOptions } from './prompt.ts';

const CHUNK_CHARS = 15_000;
const PARALLEL = 4; // map calls in flight at once; more trips DashScope's rate limit

const SUMMARY_TASK = `TASK: Write a study summary of the document in Markdown.
- Structure: a short introduction, the main ideas grouped under "##" headings with bullet points, then a brief conclusion.
- Keep definitions, key facts, numbers and formulas a learner must remember. Bold the key terms.
- Do not add facts that are not in the document.

Return JSON only: {"title": string, "markdown": string}`;

const NOTES_TASK = `TASK: The document is one part of a longer text. Write concise bullet notes of every key idea, definition, fact, number and formula in this part, in order. Notes only, no introduction or conclusion.`;

const schema = z.object({
  title: z.string().trim().min(1),
  markdown: z.string().trim().min(1),
}) satisfies z.ZodType<Summary>;

/**
 * Short documents are summarized in one call. Long ones go map-reduce: notes per chunk, then
 * one summary of the notes, so the end of a long document is covered as well as the start.
 */
export async function generateSummary(llm: Llm, documentText: string, options: GenerateOptions = {}): Promise<Summary> {
  const text = prepareDocument(documentText);
  const language = options.language ?? detectLanguage(text);
  const chunks = chunk(text, CHUNK_CHARS);

  let source = text;
  if (chunks.length > 1) {
    const notes: string[] = [];
    for (let i = 0; i < chunks.length; i += PARALLEL) {
      notes.push(...(await Promise.all(chunks.slice(i, i + PARALLEL).map((part) => llm.complete({
        messages: [
          { role: 'system', content: systemPrompt(NOTES_TASK, language) },
          { role: 'user', content: documentMessage(part, options.title) },
        ],
        temperature: 0.3,
        maxTokens: 1500,
      })))));
    }
    source = notes.join('\n\n');
  }

  return generateJson(llm, [
    { role: 'system', content: systemPrompt(SUMMARY_TASK, language) },
    { role: 'user', content: documentMessage(source, options.title) },
  ], schema, { temperature: 0.5, maxTokens: 3000 });
}
