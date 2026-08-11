import { getCatalog } from './services/catalog-service.js';
import { deleteItem, getTable, listTables, saveItem } from './services/dynamodb-service.js';
import { listEmails } from './services/email-service.js';
import { deleteMessage, listQueues, receiveMessages } from './services/sqs-service.js';
import { getTopic, listTopics, publishMessage } from './services/sns-service.js';
import { readJson, sendJson } from './http.js';

export async function routeApi(request, response, url) {
  if (url.pathname === '/api/health') return sendJson(response, 200, { ok: true });
  if (url.pathname === '/api/services') return sendJson(response, 200, await getCatalog());
  if (url.pathname === '/api/emails') return sendJson(response, 200, { emails: await listEmails() });
  if (url.pathname === '/api/dynamodb/tables') return sendJson(response, 200, { tables: await listTables() });
  if (url.pathname === '/api/sqs/queues') return sendJson(response, 200, { queues: await listQueues() });
  if (url.pathname === '/api/sns/topics') return sendJson(response, 200, { topics: await listTopics() });

  if (url.pathname === '/api/sqs/messages') {
    const queueUrl = url.searchParams.get('queueUrl');
    if (!queueUrl) throw Object.assign(new Error('queueUrl is required'), { status: 400 });
    if (request.method === 'GET') return sendJson(response, 200, { messages: await receiveMessages(queueUrl) });
    if (request.method === 'DELETE') {
      const { receiptHandle } = await readJson(request);
      if (!receiptHandle) throw Object.assign(new Error('receiptHandle is required'), { status: 400 });
      await deleteMessage(queueUrl, receiptHandle);
      return sendJson(response, 200, { ok: true });
    }
  }

  if (url.pathname === '/api/sns/topic') {
    const topicArn = url.searchParams.get('topicArn');
    if (!topicArn) throw Object.assign(new Error('topicArn is required'), { status: 400 });
    if (request.method === 'GET') return sendJson(response, 200, await getTopic(topicArn));
    if (request.method === 'POST') {
      const { message, subject } = await readJson(request);
      if (typeof message !== 'string' || !message.length) throw Object.assign(new Error('message is required'), { status: 400 });
      return sendJson(response, 200, await publishMessage(topicArn, message, subject));
    }
  }

  const tableMatch = url.pathname.match(/^\/api\/dynamodb\/tables\/([^/]+)\/items$/);
  if (tableMatch) {
    const tableName = decodeURIComponent(tableMatch[1]);
    if (request.method === 'GET') return sendJson(response, 200, await getTable(tableName));
    const body = await readJson(request);
    if (request.method === 'PUT') return sendJson(response, 200, { item: await saveItem(tableName, body.item, body.types) });
    if (request.method === 'DELETE') {
      await deleteItem(tableName, body.key);
      return sendJson(response, 200, { ok: true });
    }
  }
  return false;
}
