import { localstack, s3Request, xmlValues } from '../lib/localstack.js';

export const s3Regions = [
  'af-south-1', 'ap-east-1', 'ap-east-2', 'ap-northeast-1', 'ap-northeast-2',
  'ap-northeast-3', 'ap-south-1', 'ap-south-2', 'ap-southeast-1', 'ap-southeast-2',
  'ap-southeast-3', 'ap-southeast-4', 'ap-southeast-5', 'ap-southeast-7', 'ca-central-1',
  'ca-west-1', 'eu-central-1', 'eu-central-2', 'eu-north-1', 'eu-south-1', 'eu-south-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'il-central-1', 'me-central-1', 'me-south-1',
  'mx-central-1', 'sa-east-1', 'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
];

const encodePath = (value) => String(value).split('/').map(encodeURIComponent).join('/');
const bucketPath = (bucket, suffix = '') => `/${encodeURIComponent(bucket)}${suffix}`;
const objectPath = (bucket, key) => bucketPath(bucket, `/${encodePath(key)}`);

const xmlBlocks = (xml, tag) =>
  [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((match) => match[1]);

export async function listBuckets() {
  const xml = await (await s3Request('/')).text();
  const names = xmlValues(xml, 'Name');
  const created = xmlValues(xml, 'CreationDate');
  return Promise.all(
    names.map(async (name, index) => {
      try {
        const locationXml = await (await s3Request(`${bucketPath(name)}?location`)).text();
        const location = xmlValues(locationXml, 'LocationConstraint')[0] || 'us-east-1';
        // AWS can still return the legacy "EU" value for eu-west-1 buckets.
        const region = location === 'EU' ? 'eu-west-1' : location;
        return { name, createdAt: created[index] || '', region };
      } catch {
        // One inaccessible bucket should not prevent the remaining buckets from
        // being listed and filtered.
        return { name, createdAt: created[index] || '', region: 'unknown' };
      }
    }),
  );
}

export async function createBucket(name, region = localstack.region) {
  // S3 requires a LocationConstraint when the bucket is created outside
  // us-east-1. Without it, LocalStack can acknowledge the raw PUT while the
  // bucket is not created in the region configured for the viewer.
  const regional = region !== 'us-east-1';
  const body = regional
    ? `<CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><LocationConstraint>${region}</LocationConstraint></CreateBucketConfiguration>`
    : undefined;
  await s3Request(bucketPath(name), {
    method: 'PUT',
    ...(regional ? { headers: { 'Content-Type': 'application/xml' }, body } : {}),
  }, region);
  return { name, region };
}

export async function deleteBucket(name) {
  await s3Request(bucketPath(name), { method: 'DELETE' });
}

export async function listObjects(bucket, prefix = '') {
  const query = new URLSearchParams({ 'list-type': '2' });
  if (prefix) query.set('prefix', prefix);
  const xml = await (await s3Request(`${bucketPath(bucket)}?${query}`)).text();
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
  const response = await s3Request(objectPath(bucket, key));
  const bytes = Buffer.from(await response.arrayBuffer());
  const metadata = {};
  for (const [name, value] of response.headers)
    if (name.startsWith('x-amz-meta-')) metadata[name.slice(11)] = value;
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const textual = /^(text\/|application\/(json|xml|javascript))/.test(contentType);
  return {
    key,
    size: bytes.length,
    contentType,
    etag: (response.headers.get('etag') || '').replace(/^"|"$/g, ''),
    lastModified: response.headers.get('last-modified') || '',
    metadata,
    preview: textual && bytes.length <= 1024 * 1024 ? bytes.toString('utf8') : null,
  };
}

export async function downloadObject(bucket, key) {
  return s3Request(objectPath(bucket, key));
}

export async function uploadObject(bucket, key, content, contentType, metadata = {}) {
  const headers = { 'Content-Type': contentType || 'application/octet-stream' };
  for (const [name, value] of Object.entries(metadata || {}))
    headers[`x-amz-meta-${name}`] = String(value);
  await s3Request(objectPath(bucket, key), {
    method: 'PUT',
    headers,
    body: Buffer.from(content, 'base64'),
  });
  return { key };
}

export async function updateObject(bucket, key, contentType, metadata = {}) {
  const headers = {
    'x-amz-copy-source': `/${encodeURIComponent(bucket)}/${encodePath(key)}`,
    'x-amz-metadata-directive': 'REPLACE',
    'Content-Type': contentType || 'application/octet-stream',
  };
  for (const [name, value] of Object.entries(metadata || {}))
    headers[`x-amz-meta-${name}`] = String(value);
  await s3Request(objectPath(bucket, key), { method: 'PUT', headers });
  return { key };
}

export async function deleteObject(bucket, key) {
  await s3Request(objectPath(bucket, key), { method: 'DELETE' });
}
