import { z } from 'zod';
import type { FlashcardDeck } from '../../../shared/study.ts';
import type { Llm } from './llm.ts';
import { generateJson, lenientArray } from './json.ts';
import { detectLanguage, documentMessage, fit, prepareDocument, systemPrompt, type GenerateOptions } from './prompt.ts';

const BUDGET_CHARS = 15_000;

const TASK = `TASK: Create 10-20 flashcards (fewer for a short document) that help a student remember the document.
- One idea per card. The question is specific and answerable without seeing the document; the answer is short but complete.
- Cover definitions, key facts, causes and effects, comparisons and formulas from the document. Do not invent facts.
- Order cards from basic to advanced. "tag" is a 1-3 word topic label.

Return JSON only: {"title": string, "cards": [{"question": string, "answer": string, "tag": string}]}`;

const card = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  tag: z.string().trim().optional(),
});

const schema = z.object({
  title: z.string().trim().min(1),
  cards: lenientArray(card),
}) satisfies z.ZodType<FlashcardDeck, unknown>;

export async function generateFlashcards(llm: Llm, documentText: string, options: GenerateOptions = {}): Promise<FlashcardDeck> {
  const text = prepareDocument(documentText);
  const language = options.language ?? detectLanguage(text);
  return generateJson(llm, [
    { role: 'system', content: systemPrompt(TASK, language) },
    { role: 'user', content: documentMessage(fit(text, BUDGET_CHARS), options.title) },
  ], schema, { temperature: 0.4 });
}
