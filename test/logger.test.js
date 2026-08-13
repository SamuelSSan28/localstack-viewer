import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogger } from '../src/logger.js';

test('writes structured details that Docker can collect', () => {
  let output = '';
  const logger = createLogger({
    write: (line) => (output += line),
    now: () => new Date('2026-08-13T10:00:00.000Z'),
  });

  logger.info('API request completed', { method: 'GET', path: '/api/health', status: 200 });

  assert.deepEqual(JSON.parse(output), {
    timestamp: '2026-08-13T10:00:00.000Z',
    level: 'info',
    message: 'API request completed',
    method: 'GET',
    path: '/api/health',
    status: 200,
  });
});

test('includes stack traces for detailed failures and respects the log level', () => {
  const lines = [];
  const logger = createLogger({ level: 'error', write: (line) => lines.push(JSON.parse(line)) });

  logger.info('hidden');
  logger.error('API request failed', new TypeError('connection refused'), { status: 502 });

  assert.equal(lines.length, 1);
  assert.equal(lines[0].error, 'connection refused');
  assert.equal(lines[0].errorName, 'TypeError');
  assert.match(lines[0].stack, /TypeError: connection refused/);
  assert.equal(lines[0].status, 502);
});
