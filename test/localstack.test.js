import assert from 'node:assert/strict';
import test from 'node:test';
import { xmlValues } from '../src/lib/localstack.js';

test('extrai e decodifica valores XML de respostas Query da AWS', () => {
  const xml = '<Messages><Message><Body>{&quot;name&quot;:&quot;Local &amp; Stack&quot;}</Body></Message></Messages>';
  assert.deepEqual(xmlValues(xml, 'Body'), ['{"name":"Local & Stack"}']);
});
