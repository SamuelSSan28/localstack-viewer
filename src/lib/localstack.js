export const localstack = {
  endpoint: process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566',
  region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
};

export async function localstackRequest(path, options = {}) {
  const response = await fetch(`${localstack.endpoint}${path}`, {
    signal: AbortSignal.timeout(5000),
    ...options,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LocalStack HTTP ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
  }
  return response;
}

export async function dynamoRequest(action, payload = {}) {
  return (await localstackRequest('/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.0',
      'X-Amz-Target': `DynamoDB_20120810.${action}`,
    },
    body: JSON.stringify(payload),
  })).json();
}

export const xmlValues = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}>(.*?)</${tag}>`, 'gs'))]
  .map((match) => match[1]
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&'));
