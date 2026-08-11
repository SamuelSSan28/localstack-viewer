import { getCatalog } from './services/catalog-service.js';
import { deleteItem, getTable, listTables, saveItem } from './services/dynamodb-service.js';
import { listEmails } from './services/email-service.js';
import { readJson, sendJson } from './http.js';

export async function routeApi(request, response, url) {
  if (url.pathname === '/api/health') return sendJson(response, 200, { ok: true });
  if (url.pathname === '/api/services') return sendJson(response, 200, await getCatalog());
  if (url.pathname === '/api/emails') return sendJson(response, 200, { emails: await listEmails() });
  if (url.pathname === '/api/dynamodb/tables') return sendJson(response, 200, { tables: await listTables() });

  const tableMatch = url.pathname.match(/^\/api\/dynamodb\/tables\/([^/]+)\/items$/);
  if (tableMatch) {
    const tableName = decodeURIComponent(tableMatch[1]);
    if (request.method === 'GET') return sendJson(response, 200, await getTable(tableName));
    const body = await readJson(request);
    if (request.method === 'PUT') return sendJson(response, 200, { item: await saveItem(tableName, body.item) });
    if (request.method === 'DELETE') {
      await deleteItem(tableName, body.key);
      return sendJson(response, 200, { ok: true });
    }
  }
  return false;
}
