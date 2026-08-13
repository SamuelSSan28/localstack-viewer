import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('workflow publishes to GHCR outside pull requests', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/docker.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /REGISTRY: ghcr\.io/);
  assert.match(workflow, /IMAGE_NAME: \$\{\{ github\.repository \}\}/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /docker\/login-action@v3/);
  assert.match(workflow, /password: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.match(workflow, /push: \$\{\{ github\.event_name != 'pull_request' \}\}/);
  assert.match(workflow, /tags: \['v\*\.\*\.\*'\]/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
});

test('workflow publishes a multi-platform Docker image', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/docker.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /docker\/setup-qemu-action@v3/);
  assert.match(workflow, /^\s+platforms: linux\/amd64,linux\/arm64$/m);
});

test('published image starts the viewer entry point with an absolute path', async () => {
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');

  assert.match(dockerfile, /^CMD \["node", "\/app\/src\/server\.js"\]$/m);
});
