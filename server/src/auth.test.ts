import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { hashPassword, SESSION_COOKIE, verifyPassword } from './auth.ts';

let server: Server;
let base: string;

before(() => {
  server = createApp(openDb(':memory:'), { rateLimits: false }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  const text = await res.text();
  return {
    status: res.status,
    body: text ? JSON.parse(text) : undefined,
    setCookie,
    cookie: setCookie.split(';')[0],
  };
}

const alice = { username: 'alice', email: 'alice@example.com', password: 'correct horse', displayName: 'Alice' };

test('register creates a user and an httpOnly session', async () => {
  const r = await call('POST', '/api/auth/register', alice);
  assert.equal(r.status, 201);
  assert.equal(r.body.user.username, 'alice');
  assert.equal(r.body.user.displayName, 'Alice');
  assert.equal(r.body.user.password_hash, undefined);
  assert.match(r.setCookie, new RegExp(`^${SESSION_COOKIE}=`));
  assert.match(r.setCookie, /HttpOnly/i);
  assert.match(r.setCookie, /SameSite=Lax/i);

  const me = await call('GET', '/api/auth/me', undefined, r.cookie);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'alice@example.com');
});

test('register rejects duplicates case-insensitively', async () => {
  const sameEmail = await call('POST', '/api/auth/register', { ...alice, username: 'alice2', email: 'ALICE@example.com' });
  assert.deepEqual([sameEmail.status, sameEmail.body.error], [409, 'email_taken']);
  const sameName = await call('POST', '/api/auth/register', { ...alice, username: 'ALICE', email: 'other@example.com' });
  assert.deepEqual([sameName.status, sameName.body.error], [409, 'username_taken']);
});

test('register validates input and names the bad fields', async () => {
  const r = await call('POST', '/api/auth/register', { username: 'a', email: 'nope', password: 'short' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'invalid_input');
  assert.deepEqual(r.body.fields.sort(), ['email', 'password', 'username']);
});

test('login works by username or email and rejects bad credentials', async () => {
  for (const login of ['alice', 'Alice@Example.com']) {
    const r = await call('POST', '/api/auth/login', { login, password: alice.password });
    assert.equal(r.status, 200, `login as ${login}`);
    assert.equal(r.body.user.username, 'alice');
  }
  const wrong = await call('POST', '/api/auth/login', { login: 'alice', password: 'wrong password' });
  assert.deepEqual([wrong.status, wrong.body.error], [401, 'invalid_credentials']);
  const unknown = await call('POST', '/api/auth/login', { login: 'nobody', password: 'whatever1' });
  assert.deepEqual([unknown.status, unknown.body.error], [401, 'invalid_credentials']);
});

test('logout revokes the session', async () => {
  const { cookie } = await call('POST', '/api/auth/login', { login: 'alice', password: alice.password });
  assert.equal((await call('POST', '/api/auth/logout', undefined, cookie)).status, 204);
  assert.equal((await call('GET', '/api/auth/me', undefined, cookie)).status, 401);
});

test('me without a session is 401; unknown api route is 404; bad JSON is 400', async () => {
  assert.equal((await call('GET', '/api/auth/me')).status, 401);
  assert.equal((await call('GET', '/api/nope')).status, 404);
  const bad = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(bad.status, 400);
});

test('password hashes are salted and verifiable', async () => {
  const [a, b] = [await hashPassword('secret pass'), await hashPassword('secret pass')];
  assert.notEqual(a, b);
  assert.ok(!a.includes('secret'));
  assert.equal(await verifyPassword('secret pass', a), true);
  assert.equal(await verifyPassword('secret pasS', a), false);
});
