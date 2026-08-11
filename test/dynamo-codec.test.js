import assert from 'node:assert/strict';
import test from 'node:test';
import { marshall, unmarshall } from '../src/lib/dynamo-codec.js';

test('converts JSON objects to DynamoDB attributes and back', () => {
  const item = {
    id: 'user-1',
    age: 32,
    active: true,
    profile: { city: 'Recife' },
    tags: ['admin', 'local'],
    deletedAt: null,
  };

  assert.deepEqual(unmarshall(marshall(item)), item);
});

test('decodes sets returned by DynamoDB', () => {
  assert.deepEqual(unmarshall({ roles: { SS: ['reader', 'writer'] }, scores: { NS: ['1', '2.5'] } }), {
    roles: ['reader', 'writer'],
    scores: [1, 2.5],
  });
});

test('preserves set types when saving an edited item', () => {
  assert.deepEqual(marshall({ roles: ['reader'], scores: [1, 2] }, { roles: 'SS', scores: 'NS' }), {
    roles: { SS: ['reader'] },
    scores: { NS: ['1', '2'] },
  });
});

test('rejects unsupported values', () => {
  assert.throws(() => marshall({ invalid: undefined }), /Unsupported DynamoDB type/);
});
