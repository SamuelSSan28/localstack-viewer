import { badRequest } from '../errors.js';
import { readJson, sendJson } from '../http.js';
import { getTopic, listTopics, publishMessage } from '../services/sns-service.js';
import { exactRoute, required } from './route-utils.js';

async function getSnsTopic(_request, response, url) {
  const topicArn = required(url.searchParams.get('topicArn'), 'topicArn');
  return sendJson(response, 200, await getTopic(topicArn));
}

async function publishSnsMessage(request, response, url) {
  const topicArn = required(url.searchParams.get('topicArn'), 'topicArn');
  const { message, subject } = await readJson(request);
  if (typeof message !== 'string' || !message.length) throw badRequest('message is required');
  return sendJson(response, 200, await publishMessage(topicArn, message, subject));
}

export const snsRoutes = [
  exactRoute('/api/sns/topics', {
    GET: async (_request, response) =>
      sendJson(response, 200, { topics: await listTopics() }),
  }),
  exactRoute('/api/sns/topic', { GET: getSnsTopic, POST: publishSnsMessage }),
];
