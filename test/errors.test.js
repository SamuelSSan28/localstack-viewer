import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError, badRequest } from '../src/errors.js';

test('creates consistent HTTP errors for request validation', () => {
  const error = badRequest('name is required');

  assert.ok(error instanceof HttpError);
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'HttpError');
  assert.equal(error.status, 400);
  assert.equal(error.message, 'name is required');
});
