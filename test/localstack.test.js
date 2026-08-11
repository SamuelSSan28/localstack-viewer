import assert from 'node:assert/strict';
import test from 'node:test';
import { xmlValues } from '../src/lib/localstack.js';

test('extracts and decodes XML values from AWS Query responses', () => {
  const xml = '<Messages><Message><Body>{&quot;name&quot;:&quot;Local &amp; Stack&quot;}</Body></Message></Messages>';
  assert.deepEqual(xmlValues(xml, 'Body'), ['{"name":"Local & Stack"}']);
});
