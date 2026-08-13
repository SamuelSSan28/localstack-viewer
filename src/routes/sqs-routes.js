import { readJson, sendJson } from '../http.js';
import { deleteMessage, listQueues, receiveMessages } from '../services/sqs-service.js';
import { exactRoute, required } from './route-utils.js';

async function getMessages(_request, response, url) {
  const queueUrl = required(url.searchParams.get('queueUrl'), 'queueUrl');
  return sendJson(response, 200, { messages: await receiveMessages(queueUrl) });
}

async function removeMessage(request, response, url) {
  const queueUrl = required(url.searchParams.get('queueUrl'), 'queueUrl');
  const { messageId, receiptHandle } = await readJson(request);
  required(messageId, 'messageId');
  await deleteMessage(queueUrl, messageId, receiptHandle);
  return sendJson(response, 200, { ok: true });
}

export const sqsRoutes = [
  exactRoute('/api/sqs/queues', {
    GET: async (_request, response) =>
      sendJson(response, 200, { queues: await listQueues() }),
  }),
  exactRoute('/api/sqs/messages', { GET: getMessages, DELETE: removeMessage }),
];
