import { z } from 'zod';
import type { Mindmap, MindmapEdge, MindmapNode } from '../../../shared/study.ts';
import type { Llm } from './llm.ts';
import { generateJson } from './json.ts';
import { detectLanguage, documentMessage, fit, prepareDocument, systemPrompt, type GenerateOptions } from './prompt.ts';

const BUDGET_CHARS = 15_000;

// The model writes a nested tree (natural for it); we flatten to React Flow nodes and edges.
const TASK = `TASK: Build a mind map of the document's knowledge structure.
- "root" is the core topic. Give it 3-7 main branches with 2-5 children each, at most 3 levels below the root.
- Labels are short noun phrases (at most ~8 words), not sentences.

Return JSON only: {"title": string, "root": {"label": string, "children": [{"label": string, "children": [...]}]}}`;

interface Branch {
  label: string;
  children?: Branch[];
}

const branch: z.ZodType<Branch> = z.lazy(() => z.object({
  label: z.string().trim().min(1),
  children: z.array(branch).optional(),
}));

const schema = z.object({ title: z.string().trim().min(1), root: branch });

/** Depth-first ids ("n", "n-0", "n-0-2") are stable for the same tree and readable in logs. */
function flatten(root: Branch): { nodes: MindmapNode[]; edges: MindmapEdge[] } {
  const nodes: MindmapNode[] = [];
  const edges: MindmapEdge[] = [];
  const visit = (b: Branch, id: string, depth: number) => {
    nodes.push({ id, label: b.label, depth });
    b.children?.forEach((child, i) => {
      const childId = `${id}-${i}`;
      edges.push({ id: `e-${childId}`, source: id, target: childId });
      visit(child, childId, depth + 1);
    });
  };
  visit(root, 'n', 0);
  return { nodes, edges };
}

export async function generateMindmap(llm: Llm, documentText: string, options: GenerateOptions = {}): Promise<Mindmap> {
  const text = prepareDocument(documentText);
  const language = options.language ?? detectLanguage(text);
  const { title, root } = await generateJson(llm, [
    { role: 'system', content: systemPrompt(TASK, language) },
    { role: 'user', content: documentMessage(fit(text, BUDGET_CHARS), options.title) },
  ], schema, { temperature: 0.3 });
  return { title, ...flatten(root) };
}
