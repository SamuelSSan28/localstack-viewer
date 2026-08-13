import { badRequest } from '../errors.js';
import { readJson, sendJson } from '../http.js';
import { deleteMessage, listQueues, receiveMessages, sendMessage } from '../services/sqs-service.js';
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

async function addMessage(request, response, url) {
  const queueUrl = required(url.searchParams.get('queueUrl'), 'queueUrl');
  const { message, messageGroupId, deduplicationId } = await readJson(request);
  if (typeof message !== 'string' || !message.length) throw badRequest('message is required');
  if (queueUrl.endsWith('.fifo') && !messageGroupId)
    throw badRequest('messageGroupId is required for FIFO queues');
  return sendJson(
    response,
    201,
    await sendMessage(queueUrl, message, { messageGroupId, deduplicationId }),
  );
}

export const sqsRoutes = [
  exactRoute('/api/sqs/queues', {
    GET: async (_request, response) =>
      sendJson(response, 200, { queues: await listQueues() }),
  }),
  exactRoute('/api/sqs/messages', { GET: getMessages, POST: addMessage, DELETE: removeMessage }),
];
