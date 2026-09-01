import { badRequest } from '../errors.js';
import { readJson, sendJson } from '../http.js';
import { listEventBuses, listRules, putEvent } from '../services/eventbridge-service.js';
import { exactRoute, required } from './route-utils.js';

async function publishEvent(request, response) {
  const body = await readJson(request);
  const eventBusName = required(body.eventBusName, 'eventBusName');
  required(body.source, 'source');
  required(body.detailType, 'detailType');
  if (!body.detail || typeof body.detail !== 'object' || Array.isArray(body.detail))
    throw badRequest('detail must be a JSON object');
  return sendJson(response, 201, await putEvent(eventBusName, body));
}

export const eventBridgeRoutes = [
  exactRoute('/api/eventbridge/buses', {
    GET: async (_request, response) => sendJson(response, 200, { buses: await listEventBuses() }),
  }),
  exactRoute('/api/eventbridge/rules', {
    GET: async (_request, response, url) =>
      sendJson(response, 200, {
        rules: await listRules(required(url.searchParams.get('eventBusName'), 'eventBusName')),
      }),
  }),
  exactRoute('/api/eventbridge/events', { POST: publishEvent }),
];
