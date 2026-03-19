import { callQwen } from './qwenClient.js';
import { sanitizeDocumentText, sanitizeFileName } from './promptGuard.js';
import { buildSystemPrompt, normalizeLanguage } from './promptBuilder.js';

function normalizeSummaryText(response) {
    const asText = typeof response === 'string' ? response.trim() : String(response ?? '').trim();
    if (!asText) return '';

    // Common case: model returns JSON wrapper like {"summary":"..."}
    try {
        const parsed = JSON.parse(asText);
        if (typeof parsed?.summary === 'string' && parsed.summary.trim()) {
            return parsed.summary.trim();
        }
    } catch {
        // ignore parse failures and continue
    }

    // Handle fenced JSON blocks containing { summary: "..." }
    const codeBlockMatch = asText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch?.[1]) {
        try {
            const parsed = JSON.parse(codeBlockMatch[1].trim());
            if (typeof parsed?.summary === 'string' && parsed.summary.trim()) {
                return parsed.summary.trim();
            }
        } catch {
            // ignore and fall through
        }
    }

    // Handle responses that include explanatory text plus an inline JSON object.
    const jsonObjectMatch = asText.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch?.[0]) {
        try {
            const parsed = JSON.parse(jsonObjectMatch[0]);
            if (typeof parsed?.summary === 'string' && parsed.summary.trim()) {
                return parsed.summary.trim();
            }
        } catch {
            // ignore and fall through
        }
    }

    return asText;
}

/**
 * Generate a markdown summary from document text
 */
export async function generateSummary(text, fileName, options = {}) {
    // Truncate text if it's exceptionally long to respect context window and save tokens
    const maxChars = 20000;
    const truncatedText = text.length > maxChars
        ? text.substring(0, maxChars) + '\n\n[... phần còn lại đã được lược bỏ ...]'
        : text;

    const cleanDoc = sanitizeDocumentText(truncatedText);
    const cleanName = sanitizeFileName(fileName);
    const language = normalizeLanguage(options.language, options.acceptLanguage);
    const systemPrompt = buildSystemPrompt('summary', language);
    const userMessage = language === 'vi'
        ? `Tên tài liệu: "${cleanName}"\n\n<document>\n${cleanDoc}\n</document>\n\nHãy tóm tắt tài liệu này.`
        : `Document name: "${cleanName}"\n\n<document>\n${cleanDoc}\n</document>\n\nPlease summarize this document.`;

    const response = await callQwen(systemPrompt, userMessage, {
        temperature: 0.5,
        maxTokens: 3000,
        userId: options.userId,
        action: 'generate_summary'
    });

    return normalizeSummaryText(response);
}
