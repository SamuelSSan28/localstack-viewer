import { createHash, createHmac } from 'node:crypto';

export const localstack = {
  endpoint: process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566',
  region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
};

const hash = (value) => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const awsEncode = (value) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

// LocalStack's edge port uses the SigV4 service name to reliably route requests.
// Signing also keeps the viewer working when S3 authentication is enforced.
export async function s3Request(path, options = {}, region = localstack.region) {
  const url = new URL(path, `${localstack.endpoint.replace(/\/$/, '')}/`);
  const method = options.method || 'GET';
  const body = options.body === undefined ? Buffer.alloc(0) : Buffer.from(options.body);
  const payloadHash = hash(body);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const headers = new globalThis.Headers(options.headers);
  headers.set('host', url.host);
  headers.set('x-amz-content-sha256', payloadHash);
  headers.set('x-amz-date', amzDate);
  const signedHeaderNames = [...headers.keys()].map((name) => name.toLowerCase()).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers.get(name).trim().replace(/\s+/g, ' ')}\n`)
    .join('');
  const canonicalQuery = [...url.searchParams]
    .map(([name, value]) => [awsEncode(name), awsEncode(value)])
    .sort(([leftName, leftValue], [rightName, rightValue]) =>
      leftName === rightName ? leftValue.localeCompare(rightValue) : leftName.localeCompare(rightName),
    )
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
  const canonicalRequest = [
    method,
    url.pathname.split('/').map((part) => awsEncode(decodeURIComponent(part))).join('/'),
    canonicalQuery,
    canonicalHeaders,
    signedHeaderNames.join(';'),
    payloadHash,
  ].join('\n');
  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${hash(canonicalRequest)}`;
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${localstack.secretAccessKey}`, date), region), 's3'),
    'aws4_request',
  );
  headers.set(
    'authorization',
    `AWS4-HMAC-SHA256 Credential=${localstack.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${createHmac('sha256', signingKey).update(stringToSign).digest('hex')}`,
  );
  headers.delete('host'); // fetch supplies Host; it cannot be set consistently by every runtime.
  return localstackRequest(url.href, {
    ...options,
    method,
    headers: Object.fromEntries(headers),
    ...(options.body === undefined ? {} : { body }),
  });
}

export async function localstackRequest(path, options = {}) {
  const target = /^https?:\/\//.test(path) ? path : `${localstack.endpoint}${path}`;
  const response = await fetch(target, {
    signal: AbortSignal.timeout(5000),
    ...options,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `LocalStack HTTP ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`,
    );
  }
  return response;
}

export async function dynamoRequest(action, payload = {}) {
  return (
    await localstackRequest('/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.0',
        'X-Amz-Target': `DynamoDB_20120810.${action}`,
      },
      body: JSON.stringify(payload),
    })
  ).json();
}

export const xmlValues = (xml, tag) =>
  [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>(.*?)</${tag}>`, 'gs'))].map((match) =>
    match[1]
      .replaceAll('&quot;', '"')
      .replaceAll('&apos;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&'),
  );
