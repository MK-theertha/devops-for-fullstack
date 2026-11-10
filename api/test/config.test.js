import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';

test('fails fast when DATABASE_URL is missing', () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL/);
});

test('rejects a non-numeric PORT', () => {
  assert.throws(() => loadConfig({ DATABASE_URL: 'postgres://x', PORT: 'abc' }), /PORT/);
});

test('reads secrets from *_FILE variables', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-')), 'db_url');
  fs.writeFileSync(file, 'postgres://from-file\n');
  const config = loadConfig({ DATABASE_URL_FILE: file });
  assert.equal(config.databaseUrl, 'postgres://from-file');
});

test('applies defaults', () => {
  const config = loadConfig({ DATABASE_URL: 'postgres://x' });
  assert.equal(config.port, 3000);
  assert.equal(config.logLevel, 'info');
  assert.equal(config.appVersion, 'dev');
});
