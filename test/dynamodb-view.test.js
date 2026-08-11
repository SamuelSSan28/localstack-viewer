import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { clipboardValue, compareDynamoValues, orderedFieldNames, orderJsonValue, structuredPreview } from '../public/js/views/dynamodb.js';

test('places DynamoDB keys first and sorts remaining fields alphabetically', () => {
  const items = [{ zebra: 1, sortKey: 2 }, { alpha: 3, partitionKey: 4 }];
  assert.deepEqual(orderedFieldNames(items, ['partitionKey', 'sortKey']), ['partitionKey', 'sortKey', 'alpha', 'zebra']);
});

test('places pinned fields after DynamoDB keys in the order they were pinned', () => {
  const items = [{ zebra: 1, status: 2, sortKey: 3, name: 4, partitionKey: 5 }];
  assert.deepEqual(orderedFieldNames(items, ['partitionKey', 'sortKey'], ['status', 'name']), ['partitionKey', 'sortKey', 'status', 'name', 'zebra']);
});

test('orders JSON keys first at the root and alphabetically in nested objects', () => {
  const value = { zebra: 1, partitionKey: 'key', details: { zebra: 2, alpha: 1 }, list: [{ beta: 2, alpha: 1 }] };
  assert.deepEqual(Object.keys(orderJsonValue(value, ['partitionKey'])), ['partitionKey', 'details', 'list', 'zebra']);
  assert.deepEqual(Object.keys(orderJsonValue(value).details), ['alpha', 'zebra']);
  assert.deepEqual(Object.keys(orderJsonValue(value).list[0]), ['alpha', 'beta']);
});

test('sorts DynamoDB numbers numerically in either direction', () => {
  assert.ok(compareDynamoValues('2', '10', 'N', 'N', 'asc') < 0);
  assert.ok(compareDynamoValues('2', '10', 'N', 'N', 'desc') > 0);
});

test('sorts ISO date strings chronologically and other strings naturally', () => {
  assert.ok(compareDynamoValues('2025-12-01', '2026-01-01', 'S', 'S') < 0);
  assert.ok(compareDynamoValues('item-2', 'item-10', 'S', 'S') < 0);
});

test('keeps missing column values at the end in either direction', () => {
  assert.ok(compareDynamoValues(undefined, 'value', 'NULL', 'S', 'asc') > 0);
  assert.ok(compareDynamoValues(undefined, 'value', 'NULL', 'S', 'desc') > 0);
});

test('summarizes structured values without adding an interactive JSON control', () => {
  assert.deepEqual(structuredPreview({ status: 'created' }, 'M'), { kind: 'Object', preview: '{"status":"created"}' });
  assert.deepEqual(structuredPreview(['one', 'two'], 'L'), { kind: 'Array (2)', preview: '["one","two"]' });
  assert.deepEqual(structuredPreview(['one', 'two'], 'SS'), { kind: 'Set (2)', preview: '["one","two"]' });
  assert.equal(structuredPreview({ description: 'a'.repeat(100) }, 'M').preview.endsWith('…'), true);
});

test('keeps one full-height JSON editor for both view and edit modes', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const view = await readFile(new URL('../public/js/views/dynamodb.js', import.meta.url), 'utf8');
  assert.match(css, /body:has\(dialog\[open\]\) \{ overflow: hidden; \}/);
  assert.match(css, /#editor\[open\].*width: min\(1240px.*height: min\(820px/s);
  assert.match(css, /\.item-json-editor.*overscroll-behavior: contain.*flex: 1/s);
  assert.match(view, /editor\.readOnly = !isEditing/);
  assert.doesNotMatch(view, /item-json-preview|editor-view|editor-edit/);
});

test('offers compact, accessible row actions and clipboard controls', async () => {
  const view = await readFile(new URL('../public/js/views/dynamodb.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(view, /data-view=.*aria-label="View or edit item".*<svg/);
  assert.match(view, /data-delete=.*aria-label="Delete item".*<svg/);
  assert.match(css, /\.actions \{[^}]*width: 78px;[^}]*min-width: 78px;/);
  assert.match(view, /data-copy-row/);
  assert.match(view, /data-copy-column/);
  assert.match(view, /id="copy-item".*Copy all/);
});

test('marks key columns with an accessible star', async () => {
  const view = await readFile(new URL('../public/js/views/dynamodb.js', import.meta.url), 'utf8');
  assert.match(view, /class="key-attribute" title="Key attribute" aria-label="Key attribute">★/);
});

test('offers an accessible pin control for non-key fields', async () => {
  const view = await readFile(new URL('../public/js/views/dynamodb.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(view, /data-pin-field=.*Pin field after key columns/);
  assert.match(view, /state\.pinnedFields\[tableName\]/);
  assert.match(css, /\.pin-field\.pinned/);
});

test('copies the complete value represented by one cell', () => {
  assert.equal(clipboardValue('customer-name'), 'customer-name');
  assert.equal(clipboardValue(42), '42');
  assert.equal(clipboardValue(false), 'false');
  assert.equal(clipboardValue({ nested: ['value'] }), '{\n  "nested": [\n    "value"\n  ]\n}');
});

test('declares the star favicon', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const favicon = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
  assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml">/);
  assert.match(favicon, /fill="#facc15"/);
});
