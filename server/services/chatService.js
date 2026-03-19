import { callQwenChat } from './qwenClient.js';
import { sanitizeUserMessage, sanitizeDocumentText, sanitizeChatHistory } from './promptGuard.js';
import { buildSystemPrompt, normalizeLanguage } from './promptBuilder.js';

/**
 * Chat with document using Qwen3
 */
export async function chatWithDocument(documentText, userMessage, history = [], options = {}) {
  // Sanitize user input to prevent prompt injection
  const cleanMessage = sanitizeUserMessage(userMessage);
  const cleanHistory = sanitizeChatHistory(history);

  // Truncate and sanitize document text
  const maxDocChars = 12000;
  const truncatedDoc = documentText.length > maxDocChars
    ? documentText.substring(0, maxDocChars) + '\n\n[... nội dung tiếp theo đã được lược bớt ...]'
    : documentText;
  const cleanDoc = sanitizeDocumentText(truncatedDoc);
  const language = normalizeLanguage(options.language, options.acceptLanguage);

  const systemPrompt = buildSystemPrompt('chatSingle', language).replace('{DOCUMENT_TEXT}', cleanDoc);

  // Build message history
  const messages = [
    ...cleanHistory.slice(-10), // Keep last 10 messages for context
    { role: 'user', content: cleanMessage }
  ];

  const response = await callQwenChat(systemPrompt, messages, {
    temperature: 0.7,
    maxTokens: 2048,
    userId: options.userId || null,
    action: 'chat_document'
  });

  return response;
}

/**
 * Chat with multiple documents
 */
export async function chatWithMultipleDocuments(documents, userMessage, history = [], options = {}) {
  // Sanitize user input to prevent prompt injection
  const cleanMessage = sanitizeUserMessage(userMessage);
  const cleanHistory = sanitizeChatHistory(history);

  // Truncate and sanitize documents to fit context window.
  const maxTotalChars = 15000;
  const charsPerDoc = Math.floor(maxTotalChars / documents.length);

  let combinedText = '';
  documents.forEach((doc, idx) => {
    const text = doc.text.length > charsPerDoc
      ? doc.text.substring(0, charsPerDoc) + '...[Lược bớt]'
      : doc.text;
    combinedText += `\n\n<document name="${idx + 1}: ${doc.fileName}">\n${sanitizeDocumentText(text)}\n</document>`;
  });
  const language = normalizeLanguage(options.language, options.acceptLanguage);
  const systemPrompt = buildSystemPrompt('chatMulti', language).replace('{DOCUMENT_TEXT}', combinedText);

  const messages = [
    ...cleanHistory.slice(-10),
    { role: 'user', content: cleanMessage }
  ];

  const response = await callQwenChat(systemPrompt, messages, {
    temperature: 0.7,
    maxTokens: 2048,
    userId: options.userId || null,
    action: 'chat_multi_document'
  });

  return response;
}
