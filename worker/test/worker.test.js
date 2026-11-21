import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker, { buildPayload } from '../src/index.js';

const ENV = {
  FOUR_NORMS_API_KEY: 'test-key',
  FOUR_NORMS_GROUP_SLUG: 'falmouth-unplugged',
  ALLOWED_ORIGINS: 'https://site.example,http://localhost:1313',
};
const ORIGIN = 'https://site.example';
let calls;

function mockFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return handler(url, init); };
}
const post = (body, origin = ORIGIN, path = '/api/supporters') =>
  new Request('https://w.example' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const good = { first_name: ' Jane ', last_name: 'Doe', email: 'Jane@Example.com', zip_code: '02540', send_invite: true };

beforeEach(() => mockFetch(() => new Response(JSON.stringify({ status: 'success', message: 'Supporter Added' }), { status: 201 })));

test('success: forwards correct payload + key, returns upstream JSON unchanged', async () => {
  const res = await worker.fetch(post(good), ENV);
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { status: 'success', message: 'Supporter Added' });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://www.fournorms.com/api/v1/groups/falmouth-unplugged/supporters.json');
  assert.equal(calls[0].init.headers['X-API-Key'], 'test-key');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    send_invite: true,
    supporter: { email: 'jane@example.com', first_name: 'Jane', last_name: 'Doe', address_attributes: { zip_code: '02540' } },
  });
});

test('updates-only signup sends send_invite=false (lead) and omits empty optional fields', () => {
  const { payload, errors } = buildPayload({ first_name: 'A', email: 'a@b.co', send_invite: false });
  assert.deepEqual(errors, []);
  assert.deepEqual(payload, { send_invite: false, supporter: { email: 'a@b.co', first_name: 'A' } });
});

test('client validation errors return 422 and never call Four Norms', async () => {
  const res = await worker.fetch(post({ first_name: '', email: 'nope', zip_code: '12' }), ENV);
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.errors.length, 3);
  assert.equal(calls.length, 0);
});

test('honeypot filled -> fake success, no upstream call', async () => {
  const res = await worker.fetch(post({ ...good, website: 'spam.biz' }), ENV);
  assert.equal(res.status, 201);
  assert.equal(calls.length, 0);
});

test('Four Norms 422 messages are passed through for display', async () => {
  mockFetch(() => new Response(JSON.stringify({ errors: ['Email has already been taken'] }), { status: 422 }));
  const res = await worker.fetch(post(good), ENV);
  assert.equal(res.status, 422);
  assert.deepEqual((await res.json()).errors, ['Email has already been taken']);
});

for (const status of [400, 401, 403, 500]) {
  test(`Four Norms ${status} -> 502 with JSON error`, async () => {
    mockFetch(() => new Response(JSON.stringify({ errors: ['x'] }), { status }));
    const res = await worker.fetch(post(good), ENV);
    assert.equal(res.status, 502);
    assert.ok((await res.json()).error);
  });
}

test('network failure -> 500 with JSON error', async () => {
  mockFetch(() => { throw new TypeError('fetch failed'); });
  const res = await worker.fetch(post(good), ENV);
  assert.equal(res.status, 500);
  assert.ok((await res.json()).error);
});

test('disallowed origin -> 403, no upstream call', async () => {
  const res = await worker.fetch(post(good, 'https://evil.example'), ENV);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(calls.length, 0);
});

test('CORS preflight', async () => {
  const res = await worker.fetch(new Request('https://w.example/api/supporters', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), ENV);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('missing key -> 500 "not configured", bad JSON -> 400, GET -> 405', async () => {
  assert.equal((await worker.fetch(post(good), { ...ENV, FOUR_NORMS_API_KEY: '' })).status, 500);
  assert.equal((await worker.fetch(post('{bad'), ENV)).status, 400);
  assert.equal((await worker.fetch(new Request('https://w.example/api/supporters', { headers: { Origin: ORIGIN } }), ENV)).status, 405);
});

test('API key never appears in any response body', async () => {
  for (const s of [201, 401, 422]) {
    mockFetch(() => new Response(JSON.stringify({ errors: ['e'] }), { status: s }));
    const txt = await (await worker.fetch(post(good), ENV)).text();
    assert.ok(!txt.includes('test-key'));
  }
});
