async function request(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete the operation');
  return data;
}

export const api = {
  catalog: () => request('/api/services'),
  emails: () => request('/api/emails'),
  tables: () => request('/api/dynamodb/tables'),
  table: (name) => request(`/api/dynamodb/tables/${encodeURIComponent(name)}/items`),
  saveItem: (name, item, types = {}) => request(`/api/dynamodb/tables/${encodeURIComponent(name)}/items`, { method: 'PUT', body: JSON.stringify({ item, types }) }),
  deleteItem: (name, key) => request(`/api/dynamodb/tables/${encodeURIComponent(name)}/items`, { method: 'DELETE', body: JSON.stringify({ key }) }),
  queues: () => request('/api/sqs/queues'),
  messages: (queueUrl) => request(`/api/sqs/messages?queueUrl=${encodeURIComponent(queueUrl)}`),
  deleteMessage: (queueUrl, receiptHandle) => request(`/api/sqs/messages?queueUrl=${encodeURIComponent(queueUrl)}`, { method: 'DELETE', body: JSON.stringify({ receiptHandle }) }),
  topics: () => request('/api/sns/topics'),
  topic: (topicArn) => request(`/api/sns/topic?topicArn=${encodeURIComponent(topicArn)}`),
  publish: (topicArn, message, subject) => request(`/api/sns/topic?topicArn=${encodeURIComponent(topicArn)}`, { method: 'POST', body: JSON.stringify({ message, subject }) }),
};
