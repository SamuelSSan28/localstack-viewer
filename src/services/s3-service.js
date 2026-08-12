import { localstack, localstackRequest, xmlValues } from '../lib/localstack.js';

const encodePath = (value) => String(value).split('/').map(encodeURIComponent).join('/');
const bucketPath = (bucket, suffix = '') => `/${encodeURIComponent(bucket)}${suffix}`;
const objectPath = (bucket, key) => bucketPath(bucket, `/${encodePath(key)}`);

const xmlBlocks = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((match) => match[1]);

export async function listBuckets() {
  const xml = await (await localstackRequest('/')).text();
  const names = xmlValues(xml, 'Name');
  const created = xmlValues(xml, 'CreationDate');
  return names.map((name, index) => ({ name, createdAt: created[index] || '' }));
}

export async function createBucket(name) {
  // S3 requires a LocationConstraint when the bucket is created outside
  // us-east-1. Without it, LocalStack can acknowledge the raw PUT while the
  // bucket is not created in the region configured for the viewer.
  const regional = localstack.region !== 'us-east-1';
  const body = regional
    ? `<CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><LocationConstraint>${localstack.region}</LocationConstraint></CreateBucketConfiguration>`
    : undefined;
  await localstackRequest(bucketPath(name), {
    method: 'PUT',
    ...(regional ? { headers: { 'Content-Type': 'application/xml' }, body } : {}),
  });
  return { name };
}

export async function deleteBucket(name) { await localstackRequest(bucketPath(name), { method: 'DELETE' }); }

export async function listObjects(bucket, prefix = '') {
  const query = new URLSearchParams({ 'list-type': '2' });
  if (prefix) query.set('prefix', prefix);
  const xml = await (await localstackRequest(`${bucketPath(bucket)}?${query}`)).text();
  const objects = xmlBlocks(xml, 'Contents').map((block) => ({
    key: xmlValues(block, 'Key')[0] || '',
    size: Number(xmlValues(block, 'Size')[0] || 0),
    lastModified: xmlValues(block, 'LastModified')[0] || '',
    etag: (xmlValues(block, 'ETag')[0] || '').replace(/^"|"$/g, ''),
    storageClass: xmlValues(block, 'StorageClass')[0] || '',
  }));
  return { bucket, prefix, count: objects.length, objects };
}

export async function getObject(bucket, key) {
  const response = await localstackRequest(objectPath(bucket, key));
  const bytes = Buffer.from(await response.arrayBuffer());
  const metadata = {};
  for (const [name, value] of response.headers) if (name.startsWith('x-amz-meta-')) metadata[name.slice(11)] = value;
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const textual = /^(text\/|application\/(json|xml|javascript))/.test(contentType);
  return {
    key, size: bytes.length, contentType,
    etag: (response.headers.get('etag') || '').replace(/^"|"$/g, ''),
    lastModified: response.headers.get('last-modified') || '', metadata,
    preview: textual && bytes.length <= 1024 * 1024 ? bytes.toString('utf8') : null,
  };
}

export async function downloadObject(bucket, key) { return localstackRequest(objectPath(bucket, key)); }

export async function uploadObject(bucket, key, content, contentType, metadata = {}) {
  const headers = { 'Content-Type': contentType || 'application/octet-stream' };
  for (const [name, value] of Object.entries(metadata || {})) headers[`x-amz-meta-${name}`] = String(value);
  await localstackRequest(objectPath(bucket, key), { method: 'PUT', headers, body: Buffer.from(content, 'base64') });
  return { key };
}

export async function updateObject(bucket, key, contentType, metadata = {}) {
  const headers = { 'x-amz-copy-source': `/${encodeURIComponent(bucket)}/${encodePath(key)}`, 'x-amz-metadata-directive': 'REPLACE', 'Content-Type': contentType || 'application/octet-stream' };
  for (const [name, value] of Object.entries(metadata || {})) headers[`x-amz-meta-${name}`] = String(value);
  await localstackRequest(objectPath(bucket, key), { method: 'PUT', headers });
  return { key };
}

export async function deleteObject(bucket, key) { await localstackRequest(objectPath(bucket, key), { method: 'DELETE' }); }
