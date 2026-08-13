import { badRequest } from '../errors.js';
import { readJson, sendJson } from '../http.js';
import { localstack } from '../lib/localstack.js';
import {
  createBucket,
  deleteBucket,
  deleteObject,
  downloadObject,
  getObject,
  listBuckets,
  listObjects,
  s3Regions,
  updateObject,
  uploadObject,
} from '../services/s3-service.js';
import { exactRoute, required } from './route-utils.js';

async function getS3Buckets(_request, response) {
  return sendJson(response, 200, {
    buckets: await listBuckets(),
    defaultRegion: localstack.region,
    regions: s3Regions,
  });
}

async function createS3Bucket(request, response) {
  const { name, region = localstack.region } = await readJson(request);
  required(name, 'Bucket name');
  if (typeof region !== 'string' || !/^[a-z]{2}(?:-[a-z0-9]+)+-\d$/.test(region))
    throw badRequest('Region must be a valid AWS region (for example, us-east-1)');
  return sendJson(response, 201, { bucket: await createBucket(name, region) });
}

async function removeS3Bucket(request, response) {
  const { name } = await readJson(request);
  required(name, 'Bucket name');
  await deleteBucket(name);
  return sendJson(response, 200, { ok: true });
}

async function sendDownload(response, bucket, key) {
  const remote = await downloadObject(bucket, key);
  const headers = {
    'Content-Type': remote.headers.get('content-type') || 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(key.split('/').pop())}`,
  };
  const length = remote.headers.get('content-length');
  if (length) headers['Content-Length'] = length;
  response.writeHead(200, headers);
  response.end(Buffer.from(await remote.arrayBuffer()));
}

async function getS3Objects(_request, response, url) {
  const bucket = required(url.searchParams.get('bucket'), 'bucket');
  const key = url.searchParams.get('key');
  if (!key)
    return sendJson(response, 200, await listObjects(bucket, url.searchParams.get('prefix') || ''));
  if (url.searchParams.has('download')) return sendDownload(response, bucket, key);
  return sendJson(response, 200, { object: await getObject(bucket, key) });
}

async function createS3Object(request, response, url) {
  const bucket = required(url.searchParams.get('bucket'), 'bucket');
  const body = await readJson(request);
  if (!body.key || typeof body.content !== 'string')
    throw badRequest('key and content are required');
  const object = await uploadObject(
    bucket,
    body.key,
    body.content,
    body.contentType,
    body.metadata,
  );
  return sendJson(response, 201, { object });
}

async function updateS3Object(request, response, url) {
  const bucket = required(url.searchParams.get('bucket'), 'bucket');
  const key = required(url.searchParams.get('key'), 'key');
  const body = await readJson(request);
  const object = await updateObject(bucket, key, body.contentType, body.metadata);
  return sendJson(response, 200, { object });
}

async function removeS3Object(_request, response, url) {
  const bucket = required(url.searchParams.get('bucket'), 'bucket');
  const key = required(url.searchParams.get('key'), 'key');
  await deleteObject(bucket, key);
  return sendJson(response, 200, { ok: true });
}

export const s3Routes = [
  exactRoute('/api/s3/buckets', {
    GET: getS3Buckets,
    POST: createS3Bucket,
    DELETE: removeS3Bucket,
  }),
  exactRoute('/api/s3/objects', {
    GET: getS3Objects,
    POST: createS3Object,
    PUT: updateS3Object,
    DELETE: removeS3Object,
  }),
];
