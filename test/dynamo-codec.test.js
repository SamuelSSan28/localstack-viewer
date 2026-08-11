import assert from 'node:assert/strict';
import test from 'node:test';
import { marshall, unmarshall } from '../src/lib/dynamo-codec.js';

test('converte objetos JSON para atributos DynamoDB e de volta', () => {
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

test('decodifica conjuntos retornados pelo DynamoDB', () => {
  assert.deepEqual(unmarshall({ roles: { SS: ['reader', 'writer'] }, scores: { NS: ['1', '2.5'] } }), {
    roles: ['reader', 'writer'],
    scores: [1, 2.5],
  });
});

test('rejeita valores incompatíveis', () => {
  assert.throws(() => marshall({ invalid: undefined }), /não suportado/);
});
