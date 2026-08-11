import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Compose runs only the viewer and points to an external LocalStack instance', async () => {
  const compose = await readFile(new URL('../docker-compose.yml', import.meta.url), 'utf8');

  assert.match(compose, /^  viewer:/m);
  assert.doesNotMatch(compose, /^  localstack:/m);
  assert.match(compose, /host\.docker\.internal:4566/);
  assert.doesNotMatch(compose, /docker\.sock|localstack-data|localstack\/localstack/);
});

test('documents configurable variables in an example file', async () => {
  const environment = await readFile(new URL('../.env.example', import.meta.url), 'utf8');

  assert.match(environment, /^LOCALSTACK_ENDPOINT=/m);
  assert.match(environment, /^AWS_DEFAULT_REGION=/m);
  assert.match(environment, /^VIEWER_PORT=/m);
});
