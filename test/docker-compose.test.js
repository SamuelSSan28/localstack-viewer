import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Compose executa somente o viewer e aponta para um LocalStack externo', async () => {
  const compose = await readFile(new URL('../docker-compose.yml', import.meta.url), 'utf8');

  assert.match(compose, /^  viewer:/m);
  assert.doesNotMatch(compose, /^  localstack:/m);
  assert.match(compose, /host\.docker\.internal:4566/);
  assert.doesNotMatch(compose, /docker\.sock|localstack-data|localstack\/localstack/);
});
