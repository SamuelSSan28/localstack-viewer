async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete the operation');
  return data;
}

export const api = {
  catalog: () => request('/api/services'),
  emails: () => request('/api/emails'),
  tables: () => request('/api/dynamodb/tables'),
  table: (name) => request(`/api/dynamodb/tables/${encodeURIComponent(name)}/items`),
  saveItem: (name, item, schema = {}) =>
    request(`/api/dynamodb/tables/${encodeURIComponent(name)}/items`, {
      method: 'PUT',
      body: JSON.stringify({ item, schema }),
    }),
  deleteItem: (name, key, schema = {}) =>
    request(`/api/dynamodb/tables/${encodeURIComponent(name)}/items`, {
      method: 'DELETE',
      body: JSON.stringify({ key, schema }),
    }),
  queues: () => request('/api/sqs/queues'),
  messages: (queueUrl) => request(`/api/sqs/messages?queueUrl=${encodeURIComponent(queueUrl)}`),
  deleteMessage: (queueUrl, messageId, receiptHandle) =>
    request(`/api/sqs/messages?queueUrl=${encodeURIComponent(queueUrl)}`, {
      method: 'DELETE',
      body: JSON.stringify({ messageId, receiptHandle }),
    }),
  topics: () => request('/api/sns/topics'),
  topic: (topicArn) => request(`/api/sns/topic?topicArn=${encodeURIComponent(topicArn)}`),
  publish: (topicArn, message, subject) =>
    request(`/api/sns/topic?topicArn=${encodeURIComponent(topicArn)}`, {
      method: 'POST',
      body: JSON.stringify({ message, subject }),
    }),
  buckets: () => request('/api/s3/buckets'),
  createBucket: (name, region) =>
    request('/api/s3/buckets', { method: 'POST', body: JSON.stringify({ name, region }) }),
  deleteBucket: (name) =>
    request('/api/s3/buckets', { method: 'DELETE', body: JSON.stringify({ name }) }),
  objects: (bucket, prefix = '') =>
    request(
      `/api/s3/objects?bucket=${encodeURIComponent(bucket)}&prefix=${encodeURIComponent(prefix)}`,
    ),
  object: (bucket, key) =>
    request(`/api/s3/objects?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`),
  uploadObject: (bucket, object) =>
    request(`/api/s3/objects?bucket=${encodeURIComponent(bucket)}`, {
      method: 'POST',
      body: JSON.stringify(object),
    }),
  updateObject: (bucket, key, object) =>
    request(`/api/s3/objects?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(object),
    }),
  deleteObject: (bucket, key) =>
    request(`/api/s3/objects?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      body: '{}',
    }),
  objectDownloadUrl: (bucket, key) =>
    `/api/s3/objects?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}&download=1`,
};
