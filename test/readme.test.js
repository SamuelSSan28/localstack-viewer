import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('README documents the published image and contribution instructions in English', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /ghcr\.io\/samuelssan28\/localstack-viewer:latest/);
  assert.match(readme, /docker pull ghcr\.io\/samuelssan28\/localstack-viewer:latest/);
  assert.match(readme, /## Contributing/);
  assert.match(readme, /open a pull request with your changes/);
  assert.doesNotMatch(readme, /## Private package access|## Useful commands/);
  assert.doesNotMatch(readme, /Funcionalidades|Publicar a imagem|Desenvolvimento local/);
});
