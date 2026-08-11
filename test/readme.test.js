import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('README documents the repository image name and pull command in English', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /ghcr\.io\/<repository-owner>\/localstack-viewer:latest/);
  assert.match(readme, /docker pull ghcr\.io\/<repository-owner>\/localstack-viewer:latest/);
  assert.match(readme, /The checkout provided to this environment has no Git remote configured/);
  assert.doesNotMatch(readme, /Funcionalidades|Publicar a imagem|Desenvolvimento local/);
});
