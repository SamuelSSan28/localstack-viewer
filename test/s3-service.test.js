import assert from 'node:assert/strict';
import test from 'node:test';
import { getObject, listBuckets, listObjects, updateObject, uploadObject } from '../src/services/s3-service.js';

test('lists S3 buckets and object metadata from XML responses', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url) => url.endsWith('/')
    ? new Response('<ListAllMyBucketsResult><Buckets><Bucket><Name>assets</Name><CreationDate>2026-08-12T00:00:00Z</CreationDate></Bucket></Buckets></ListAllMyBucketsResult>')
    : new Response('<ListBucketResult><Contents><Key>images/logo final.png</Key><LastModified>2026-08-12T12:00:00Z</LastModified><ETag>&quot;abc123&quot;</ETag><Size>2048</Size><StorageClass>STANDARD</StorageClass></Contents></ListBucketResult>');

  assert.deepEqual(await listBuckets(), [{ name: 'assets', createdAt: '2026-08-12T00:00:00Z' }]);
  assert.deepEqual(await listObjects('assets'), {
    bucket: 'assets', prefix: '', count: 1,
    objects: [{ key: 'images/logo final.png', size: 2048, lastModified: '2026-08-12T12:00:00Z', etag: 'abc123', storageClass: 'STANDARD' }],
  });
});

test('uploads binary files and replaces object metadata using encoded S3 paths', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  const requests = [];
  global.fetch = async (url, options) => { requests.push({ url, options }); return new Response(''); };

  await uploadObject('my bucket', 'folder/a file.txt', Buffer.from('hello').toString('base64'), 'text/plain', { owner: 'dev' });
  await updateObject('my bucket', 'folder/a file.txt', 'text/markdown', { stage: 'local' });

  assert.equal(requests[0].url, 'http://localhost:4566/my%20bucket/folder/a%20file.txt');
  assert.equal(Buffer.from(requests[0].options.body).toString(), 'hello');
  assert.equal(requests[0].options.headers['x-amz-meta-owner'], 'dev');
  assert.equal(requests[1].options.headers['x-amz-copy-source'], '/my%20bucket/folder/a%20file.txt');
  assert.equal(requests[1].options.headers['x-amz-metadata-directive'], 'REPLACE');
});

test('returns text previews and custom metadata for object details', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => new Response('{"ready":true}', { headers: { 'Content-Type': 'application/json', ETag: '"etag-value"', 'x-amz-meta-purpose': 'fixture' } });

  const object = await getObject('data', 'status.json');
  assert.equal(object.preview, '{"ready":true}');
  assert.equal(object.contentType, 'application/json');
  assert.deepEqual(object.metadata, { purpose: 'fixture' });
  assert.equal(object.etag, 'etag-value');
});
