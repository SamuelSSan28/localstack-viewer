import { sendJson } from '../http.js';
import { getCatalog } from '../services/catalog-service.js';
import { listEmails } from '../services/email-service.js';
import { exactRoute } from './route-utils.js';

function get(pathname, load) {
  return exactRoute(pathname, {
    GET: async (_request, response) => sendJson(response, 200, await load()),
  });
}

export const staticRoutes = [
  get('/api/health', async () => ({ ok: true })),
  get('/api/services', getCatalog),
  get('/api/emails', async () => ({ emails: await listEmails() })),
];
