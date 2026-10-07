import { z } from 'zod';
import type { Quiz } from '../../../shared/study.ts';
import type { Llm } from './llm.ts';
import { generateJson, lenientArray } from './json.ts';
import { detectLanguage, documentMessage, fit, prepareDocument, systemPrompt, type GenerateOptions } from './prompt.ts';

const BUDGET_CHARS = 15_000;

const TASK = `TASK: Create a 10-question multiple-choice quiz (fewer for a short document) from the document.
- Each question has exactly 4 options and exactly 1 correct answer; "correctIndex" is its 0-based position. Vary that position.
- Test understanding and application, not word-for-word recall. Wrong options must be plausible.
- "explanation" says briefly why the correct answer is right, based on the document.

Return JSON only: {"title": string, "questions": [{"question": string, "options": [string, string, string, string], "correctIndex": number, "explanation": string}]}`;

const question = z.object({
  question: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).length(4).refine((o) => new Set(o).size === 4, 'Options must differ'),
  correctIndex: z.int().min(0).max(3),
  explanation: z.string().trim(),
});

const schema = z.object({
  title: z.string().trim().min(1),
  questions: lenientArray(question),
}) satisfies z.ZodType<Quiz, unknown>;

export async function generateQuiz(llm: Llm, documentText: string, options: GenerateOptions = {}): Promise<Quiz> {
  const text = prepareDocument(documentText);
  const language = options.language ?? detectLanguage(text);
  return generateJson(llm, [
    { role: 'system', content: systemPrompt(TASK, language) },
    { role: 'user', content: documentMessage(fit(text, BUDGET_CHARS), options.title) },
  ], schema, { temperature: 0.5 });
}
