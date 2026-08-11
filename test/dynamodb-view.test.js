import assert from 'node:assert/strict';
import test from 'node:test';
import { compareDynamoValues } from '../public/js/views/dynamodb.js';

test('sorts DynamoDB numbers numerically in either direction', () => {
  assert.ok(compareDynamoValues('2', '10', 'N', 'N', 'asc') < 0);
  assert.ok(compareDynamoValues('2', '10', 'N', 'N', 'desc') > 0);
});

test('sorts ISO date strings chronologically and other strings naturally', () => {
  assert.ok(compareDynamoValues('2025-12-01', '2026-01-01', 'S', 'S') < 0);
  assert.ok(compareDynamoValues('item-2', 'item-10', 'S', 'S') < 0);
});

test('keeps missing column values at the end in either direction', () => {
  assert.ok(compareDynamoValues(undefined, 'value', 'NULL', 'S', 'asc') > 0);
  assert.ok(compareDynamoValues(undefined, 'value', 'NULL', 'S', 'desc') > 0);
});
