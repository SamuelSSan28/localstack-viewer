import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('offers bucket name and region filters and displays each bucket region', async () => {
  const view = await readFile(new URL('../public/js/views/s3.js', import.meta.url), 'utf8');

  assert.match(view, /id="bucket-search"/);
  assert.match(view, /id="bucket-region"/);
  assert.match(view, /bucket\.region === region/);
  assert.match(view, /class="s3-region"/);
});
