import OpenAI from 'openai';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import './envLoader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/notemind.db');

const client = new OpenAI({
  baseURL: process.env.QWEN_API_BASE_URL || 'http://localhost:11434/v1',
  apiKey: process.env.QWEN_API_KEY || 'ollama',
});

const model = process.env.QWEN_MODEL || 'qwen3';

/** Log AI usage to the database */
function logAiUsage(userId, action, modelName, usage, latencyMs, success = true, errorMessage = null) {
  try {
    const db = new Database(DB_PATH);
    db.prepare(`INSERT INTO ai_usage_logs (user_id, action, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, success, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      userId || null, action, modelName,
      usage?.prompt_tokens || 0, usage?.completion_tokens || 0, usage?.total_tokens || 0,
      latencyMs, success ? 1 : 0, errorMessage
    );
    db.close();
  } catch { /* silent */ }
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

function isRetryable(error) {
  const msg = (error.message || '').toLowerCase();
  return msg.includes('connection error') || msg.includes('econnreset') ||
    msg.includes('etimedout') || msg.includes('enotfound') ||
    msg.includes('socket hang up') || msg.includes('fetch failed') ||
    error.status === 429 || error.status === 502 || error.status === 503 || error.status === 504;
}

async function callWithRetry(createFn, userId, action) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const start = Date.now();
    try {
      const response = await createFn();
      logAiUsage(userId, action, model, response.usage, Date.now() - start, true);
      return response.choices[0].message.content;
    } catch (error) {
      lastError = error;
      logAiUsage(userId, action, model, null, Date.now() - start, false, error.message);
      if (!isRetryable(error) || attempt === MAX_RETRIES - 1) break;
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`Qwen API attempt ${attempt + 1} failed (${error.message}), retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  console.error('Qwen API error:', lastError.message);
  throw new Error(`AI processing failed: ${lastError.message}`);
}

/**
 * Call Qwen3 with a system prompt and user message
 */
export async function callQwen(systemPrompt, userMessage, options = {}) {
  const { temperature = 0.7, maxTokens = 4096, userId = null, action = 'unknown' } = options;
  return callWithRetry(
    () => client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature,
      max_tokens: maxTokens,
    }),
    userId,
    action
  );
}

/**
 * Call Qwen3 with full message history (for chat)
 */
export async function callQwenChat(systemPrompt, messages, options = {}) {
  const { temperature = 0.7, maxTokens = 2048, userId = null, action = 'chat' } = options;
  return callWithRetry(
    () => client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature,
      max_tokens: maxTokens,
    }),
    userId,
    action
  );
}

export default client;
