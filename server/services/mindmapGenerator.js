import { callQwen } from './qwenClient.js';
import { parseAIJson } from './jsonParser.js';
import { sanitizeDocumentText, sanitizeFileName } from './promptGuard.js';
import { buildSystemPrompt, normalizeLanguage } from './promptBuilder.js';

function toText(value, fallback = '') {
  if (value && typeof value === 'object') {
    const candidate = value.label ?? value.title ?? value.name ?? value.text ?? value.content ?? value.value;
    if (candidate !== undefined && candidate !== value) {
      return toText(candidate, fallback);
    }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (value == null) return fallback;
  return String(value).trim() || fallback;
}

function normalizeNode(node, prefix = 'n', depth = 0, index = 0) {
  if (!node || typeof node !== 'object') return null;

  const label = toText(
    node.label ?? node.title ?? node.name ?? node.text ?? node.topic ?? node.content ?? node.value ?? '',
    `Node ${index + 1}`
  );
  const childrenSource = Array.isArray(node.children)
    ? node.children
    : Array.isArray(node.nodes)
      ? node.nodes
      : Array.isArray(node.branches)
        ? node.branches
        : Array.isArray(node.items)
          ? node.items
          : Array.isArray(node.subtopics)
            ? node.subtopics
            : Array.isArray(node.subNodes)
              ? node.subNodes
          : [];

  const id = toText(node.id, `${prefix}-${depth}-${index + 1}`);
  const children = childrenSource
    .map((child, childIdx) => normalizeNode(child, id, depth + 1, childIdx))
    .filter(Boolean);

  return { id, label, children };
}

function normalizeMindmapPayload(raw, fileName) {
  let root = null;
  if (Array.isArray(raw?.nodes) && raw.nodes.length > 0) root = raw.nodes[0];
  else if (raw?.root && typeof raw.root === 'object') root = raw.root;
  else if (raw?.mindmap?.root && typeof raw.mindmap.root === 'object') root = raw.mindmap.root;
  else if (raw && typeof raw === 'object') {
    root = {
      id: raw.id,
      label: raw.label || raw.title || fileName,
      children: raw.children || raw.branches || raw.nodes || []
    };
  }

  const normalizedRoot = normalizeNode(root, 'root', 0, 0);
  return {
    title: toText(raw?.title, fileName),
    nodes: normalizedRoot ? [normalizedRoot] : []
  };
}

/**
 * Generate mindmap structure from document text
 */
export async function generateMindmap(text, fileName, options = {}) {
  // Truncate text if too long (keep within context window)
  const maxChars = 15000;
  const truncatedText = text.length > maxChars
    ? text.substring(0, maxChars) + '\n\n[... nội dung đã được cắt ngắn ...]'
    : text;

  const cleanDoc = sanitizeDocumentText(truncatedText);
  const cleanName = sanitizeFileName(fileName);
  const language = normalizeLanguage(options.language, options.acceptLanguage);
  const systemPrompt = buildSystemPrompt('mindmap', language);
  const userMessage = language === 'vi'
    ? `Tên tài liệu: "${cleanName}"

<document>
${cleanDoc}
</document>

Hãy phân tích tài liệu trên và tạo sơ đồ tư duy dưới dạng JSON.`
    : `Document name: "${cleanName}"

<document>
${cleanDoc}
</document>

Please analyze the document and generate a mind map in JSON format.`;

  const response = await callQwen(systemPrompt, userMessage, {
    temperature: 0.3,
    maxTokens: 4096,
    userId: options.userId,
    action: options.action || 'generate_mindmap'
  });

  // Parse JSON from response
  try {
    const parsed = parseAIJson(response);
    const mindmap = normalizeMindmapPayload(parsed, fileName);
    if (!mindmap.nodes.length) {
      throw new Error('Mindmap payload has no root node');
    }
    return mindmap;
  } catch (error) {
    console.error('Failed to parse mindmap JSON:', error.message);
    console.error('Raw response:', response);
    // Return a fallback mindmap
    return {
      title: fileName,
      nodes: [{
        id: '1',
        label: fileName.replace(/\.[^.]+$/, ''),
        children: [{
          id: '1-1',
          label: language === 'vi' ? 'Lỗi phân tích - Vui lòng thử lại' : 'Parsing error - Please try again',
          children: []
        }]
      }]
    };
  }
}
