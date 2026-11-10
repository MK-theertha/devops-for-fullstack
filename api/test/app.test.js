import assert from 'node:assert/strict';
import { test } from 'node:test';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../src/app.js';

const config = { appVersion: 'test-sha' };
const logger = pino({ level: 'silent' });

function appWith(query) {
  return createApp({ db: { query }, logger, config });
}

test('GET /health reports the running version without touching the db', async () => {
  const app = appWith(() => assert.fail('db should not be queried'));
  const res = await request(app).get('/health').expect(200);
  assert.deepEqual(res.body, { status: 'ok', version: 'test-sha' });
});

test('GET /ready returns 503 when the database is unreachable', async () => {
  const app = appWith(async () => { throw new Error('ECONNREFUSED'); });
  await request(app).get('/ready').expect(503);
});

test('GET /ready returns 200 when the database responds', async () => {
  const app = appWith(async () => ({ rows: [{ '?column?': 1 }] }));
  await request(app).get('/ready').expect(200);
});

test('POST /api/notes rejects an empty body', async () => {
  const app = appWith(() => assert.fail('db should not be queried'));
  await request(app).post('/api/notes').send({ body: '   ' }).expect(400);
});

test('POST /api/notes inserts a trimmed note', async () => {
  let params;
  const app = appWith(async (sql, p) => {
    params = p;
    return { rows: [{ id: 1, body: p[0], created_at: '2026-01-01T00:00:00Z' }] };
  });
  const res = await request(app).post('/api/notes').send({ body: '  hello  ' }).expect(201);
  assert.deepEqual(params, ['hello']);
  assert.equal(res.body.body, 'hello');
});

test('unhandled errors return 500 with the request id', async () => {
  const app = appWith(async () => { throw new Error('boom'); });
  const res = await request(app).get('/api/notes').set('x-request-id', 'req-123').expect(500);
  assert.equal(res.body.requestId, 'req-123');
  assert.equal(res.headers['x-request-id'], 'req-123');
});

test('GET /metrics exposes request histogram labelled by route template', async () => {
  const app = appWith(async () => ({ rows: [] }));
  await request(app).get('/api/notes').expect(200);
  const res = await request(app).get('/metrics').expect(200);
  assert.match(res.text, /http_request_duration_seconds_count\{method="GET",route="\/api\/notes",status_code="200"\}/);
  assert.match(res.text, /app_info\{version="test-sha"\} 1/);
});
