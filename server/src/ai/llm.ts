import { setTimeout as sleep } from 'node:timers/promises';

// Minimal client for Qwen through DashScope's OpenAI-compatible chat API. Plain fetch, no SDK.

export type AiErrorCode = 'ai_unavailable' | 'ai_bad_output' | 'document_too_long';

/** Every error the AI layer throws on purpose; routes map `code` to an API error. */
export class AiError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AiError';
    this.code = code;
  }
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  json?: boolean; // response_format json_object; the prompt must mention "JSON"
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** The one seam: generators take an Llm so tests can pass a fake. */
export interface Llm {
  complete(req: LlmRequest): Promise<string>;
  stream(req: LlmRequest): AsyncIterable<string>;
}

export interface LlmConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  retryDelayMs: number;
}

const TIMEOUT_MS = 120_000;
const RETRIES = 2; // on 429, 5xx and network errors; never mid-stream

// QWEN_* are the legacy names, still set in .env.example and docker-compose.yml.
export function createLlm(config: Partial<LlmConfig> = {}): Llm {
  const env = process.env;
  const {
    apiKey = env.DASHSCOPE_API_KEY || env.QWEN_API_KEY,
    baseUrl = env.DASHSCOPE_BASE_URL || env.QWEN_API_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    model = env.QWEN_MODEL || 'qwen3-max',
    retryDelayMs = 1000,
  } = config;

  async function post(req: LlmRequest, stream: boolean): Promise<Response> {
    if (!apiKey) throw new AiError('ai_unavailable', 'DASHSCOPE_API_KEY is not set');
    const body = JSON.stringify({
      model,
      stream,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 4096,
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    });

    for (let attempt = 0; ; attempt++) {
      let res: Response | undefined;
      let cause: unknown;
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body,
          signal: AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), ...(req.signal ? [req.signal] : [])]),
        });
        if (res.ok) return res;
      } catch (err) {
        if (req.signal?.aborted) throw err; // the caller gave up; nothing to retry
        cause = err;
      }
      // A timeout already cost 2 minutes; retrying it would only make the user wait longer.
      const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError';
      const retryable = res ? res.status === 429 || res.status >= 500 : !timedOut;
      if (!retryable || attempt >= RETRIES) {
        const detail = res ? `HTTP ${res.status} ${(await res.text()).slice(0, 200)}` : String(cause);
        throw new AiError('ai_unavailable', `LLM request failed: ${detail}`, { cause });
      }
      await res?.body?.cancel();
      await sleep(retryDelayMs * 2 ** attempt);
    }
  }

  return {
    async complete(req) {
      const res = await post(req, false);
      let content: unknown;
      try {
        const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
        content = data.choices?.[0]?.message?.content;
      } catch (err) {
        throw new AiError('ai_unavailable', 'LLM response could not be read', { cause: err });
      }
      if (typeof content !== 'string') throw new AiError('ai_bad_output', 'LLM returned no content');
      return content;
    },

    // Server-sent events: one `data: {json}` line per delta, terminated by `data: [DONE]`.
    async *stream(req) {
      const res = await post(req, true);
      if (!res.body) throw new AiError('ai_unavailable', 'LLM returned no stream');
      let buffer = '';
      for await (const text of res.body.pipeThrough(new TextDecoderStream())) {
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') return;
          const delta = (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content;
          if (delta) yield delta;
        }
      }
    },
  };
}
