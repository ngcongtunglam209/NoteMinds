import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLlm } from './llm.ts';

// A local stand-in for the DashScope endpoint; each test queues the responses it wants.
type Handler = (req: IncomingMessage, body: Record<string, unknown>, res: ServerResponse) => void;
let handlers: Handler[] = [];
let server: Server;
let baseUrl: string;

before(() => {
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const part of req) raw += part;
    const handler = handlers.shift();
    if (!handler) return res.writeHead(500).end('no handler');
    handler(req, JSON.parse(raw), res);
  }).listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const llm = () => createLlm({ apiKey: 'test-key', baseUrl, model: 'qwen-test', retryDelayMs: 1 });
const reply = (content: string): Handler => (_req, _body, res) =>
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content } }] }));
const status = (code: number): Handler => (_req, _body, res) => res.writeHead(code).end('{"error":"x"}');

test('complete sends model, auth and JSON mode, and returns the content', async () => {
  let seen: { auth?: string; body?: Record<string, unknown> } = {};
  handlers = [(req, body, res) => {
    seen = { auth: req.headers.authorization, body };
    reply('{"a":1}')(req, body, res);
  }];
  const out = await llm().complete({ messages: [{ role: 'user', content: 'hi' }], json: true, temperature: 0.2 });
  assert.equal(out, '{"a":1}');
  assert.equal(seen.auth, 'Bearer test-key');
  assert.equal(seen.body?.model, 'qwen-test');
  assert.equal(seen.body?.temperature, 0.2);
  assert.deepEqual(seen.body?.response_format, { type: 'json_object' });
});

test('429 and 5xx are retried; the third failure gives up with ai_unavailable', async () => {
  handlers = [status(429), status(503), reply('ok')];
  assert.equal(await llm().complete({ messages: [] }), 'ok');

  handlers = [status(500), status(502), status(503), reply('never')];
  await assert.rejects(llm().complete({ messages: [] }), { code: 'ai_unavailable' });
  assert.equal(handlers.length, 1);
});

test('4xx other than 429 fails at once', async () => {
  handlers = [status(401), reply('never')];
  await assert.rejects(llm().complete({ messages: [] }), { code: 'ai_unavailable', message: /HTTP 401/ });
  assert.equal(handlers.length, 1);
});

test('missing API key is ai_unavailable, not a crash at startup', async () => {
  const keyless = createLlm({ apiKey: '', baseUrl });
  await assert.rejects(keyless.complete({ messages: [] }), { code: 'ai_unavailable' });
});

test('stream parses server-sent events split across network chunks', async () => {
  handlers = [(_req, body, res) => {
    assert.equal(body.stream, true);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const event = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
    const wire = `${event('Xin ')}: keep-alive\n\n${event('chào')}data: {"choices":[{"delta":{}}]}\n\ndata: [DONE]\n\n`;
    res.write(wire.slice(0, 17)); // splits the first event mid-JSON
    setTimeout(() => res.end(wire.slice(17)), 5);
  }];
  const parts: string[] = [];
  for await (const part of llm().stream({ messages: [] })) parts.push(part);
  assert.deepEqual(parts, ['Xin ', 'chào']);
});

test('live DashScope smoke test', { skip: !process.env.DASHSCOPE_API_KEY && 'DASHSCOPE_API_KEY not set' }, async () => {
  const live = createLlm();
  const out = await live.complete({ messages: [{ role: 'user', content: 'Trả lời bằng JSON: {"ok": true}' }], json: true, maxTokens: 20 });
  assert.deepEqual(JSON.parse(out), { ok: true });
});
