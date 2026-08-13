import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBucket,
  getObject,
  listBuckets,
  listObjects,
  updateObject,
  uploadObject,
} from '../src/services/s3-service.js';
import { localstack } from '../src/lib/localstack.js';

test('creates buckets with the configured regional constraint', async (context) => {
  const originalFetch = global.fetch;
  const originalRegion = localstack.region;
  context.after(() => {
    global.fetch = originalFetch;
    localstack.region = originalRegion;
  });
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response('');
  };

  localstack.region = 'sa-east-1';
  assert.deepEqual(await createBucket('arquivos', 'sa-east-1'), {
    name: 'arquivos',
    region: 'sa-east-1',
  });
  assert.equal(requests[0].url, 'http://localhost:4566/arquivos');
  assert.equal(requests[0].options.method, 'PUT');
  assert.equal(requests[0].options.headers['content-type'], 'application/xml');
  assert.match(requests[0].options.headers.authorization, /^AWS4-HMAC-SHA256 /);
  assert.ok(requests[0].options.headers['x-amz-content-sha256']);
  assert.match(
    requests[0].options.body.toString(),
    /<LocationConstraint>sa-east-1<\/LocationConstraint>/,
  );
});

test('creates us-east-1 buckets without a location constraint', async (context) => {
  const originalFetch = global.fetch;
  const originalRegion = localstack.region;
  context.after(() => {
    global.fetch = originalFetch;
    localstack.region = originalRegion;
  });
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response('');
  };

  localstack.region = 'sa-east-1';
  await createBucket('assets', 'us-east-1');
  assert.equal(request.options.method, 'PUT');
  assert.equal(request.options.body, undefined);
  assert.match(request.options.headers.authorization, /\/us-east-1\/s3\/aws4_request/);
});

test('lists S3 buckets and object metadata from XML responses', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (url) => {
    if (url.endsWith('/'))
      return new Response(
        '<ListAllMyBucketsResult><Buckets><Bucket><Name>assets</Name><CreationDate>2026-08-12T00:00:00Z</CreationDate></Bucket></Buckets></ListAllMyBucketsResult>',
      );
    if (url.endsWith('/assets?location'))
      return new Response(
        '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">sa-east-1</LocationConstraint>',
      );
    return new Response(
      '<ListBucketResult><Contents><Key>images/logo final.png</Key><LastModified>2026-08-12T12:00:00Z</LastModified><ETag>&quot;abc123&quot;</ETag><Size>2048</Size><StorageClass>STANDARD</StorageClass></Contents></ListBucketResult>',
    );
  };

  assert.deepEqual(await listBuckets(), [
    { name: 'assets', createdAt: '2026-08-12T00:00:00Z', region: 'sa-east-1' },
  ]);
  assert.deepEqual(await listObjects('assets'), {
    bucket: 'assets',
    prefix: '',
    count: 1,
    objects: [
      {
        key: 'images/logo final.png',
        size: 2048,
        lastModified: '2026-08-12T12:00:00Z',
        etag: 'abc123',
        storageClass: 'STANDARD',
      },
    ],
  });
});

test('normalizes default and legacy S3 bucket regions without losing inaccessible buckets', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (url) => {
    if (url.endsWith('/'))
      return new Response(
        '<ListAllMyBucketsResult><Buckets><Bucket><Name>default</Name></Bucket><Bucket><Name>legacy</Name></Bucket><Bucket><Name>private</Name></Bucket></Buckets></ListAllMyBucketsResult>',
      );
    if (url.endsWith('/default?location')) return new Response('<LocationConstraint/>');
    if (url.endsWith('/legacy?location'))
      return new Response('<LocationConstraint>EU</LocationConstraint>');
    return new Response('denied', { status: 403 });
  };

  assert.deepEqual(await listBuckets(), [
    { name: 'default', createdAt: '', region: 'us-east-1' },
    { name: 'legacy', createdAt: '', region: 'eu-west-1' },
    { name: 'private', createdAt: '', region: 'unknown' },
  ]);
});

test('uploads binary files and replaces object metadata using encoded S3 paths', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response('');
  };

  await uploadObject(
    'my bucket',
    'folder/a file.txt',
    Buffer.from('hello').toString('base64'),
    'text/plain',
    { owner: 'dev' },
  );
  await updateObject('my bucket', 'folder/a file.txt', 'text/markdown', { stage: 'local' });

  assert.equal(requests[0].url, 'http://localhost:4566/my%20bucket/folder/a%20file.txt');
  assert.equal(Buffer.from(requests[0].options.body).toString(), 'hello');
  assert.equal(requests[0].options.headers['x-amz-meta-owner'], 'dev');
  assert.equal(
    requests[1].options.headers['x-amz-copy-source'],
    '/my%20bucket/folder/a%20file.txt',
  );
  assert.equal(requests[1].options.headers['x-amz-metadata-directive'], 'REPLACE');
});

test('returns text previews and custom metadata for object details', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () =>
    new Response('{"ready":true}', {
      headers: {
        'Content-Type': 'application/json',
        ETag: '"etag-value"',
        'x-amz-meta-purpose': 'fixture',
      },
    });

  const object = await getObject('data', 'status.json');
  assert.equal(object.preview, '{"ready":true}');
  assert.equal(object.contentType, 'application/json');
  assert.deepEqual(object.metadata, { purpose: 'fixture' });
  assert.equal(object.etag, 'etag-value');
});
