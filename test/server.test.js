import assert from 'node:assert/strict';
import test from 'node:test';
import { server } from '../src/server.js';

test('rejects static directories without terminating the server', async (context) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const directory = await fetch(`http://127.0.0.1:${port}/js`);
  assert.equal(directory.status, 404);
  assert.deepEqual(await directory.json(), { error: 'Not found' });

  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
});
