import { readJson, sendJson } from '../http.js';
import { deleteItem, getTable, listTables, saveItem } from '../services/dynamodb-service.js';
import { exactRoute } from './route-utils.js';

const tableItemsPath = /^\/api\/dynamodb\/tables\/([^/]+)\/items$/;

function tableNameFrom(url) {
  return decodeURIComponent(url.pathname.match(tableItemsPath)[1]);
}

const handlers = {
  GET: async (_request, response, url) =>
    sendJson(response, 200, await getTable(tableNameFrom(url))),
  PUT: async (request, response, url) => {
    const body = await readJson(request);
    const item = await saveItem(tableNameFrom(url), body.item, body.schema);
    return sendJson(response, 200, { item });
  },
  DELETE: async (request, response, url) => {
    const body = await readJson(request);
    await deleteItem(tableNameFrom(url), body.key, body.schema);
    return sendJson(response, 200, { ok: true });
  },
};

export const dynamodbRoutes = [
  exactRoute('/api/dynamodb/tables', {
    GET: async (_request, response) =>
      sendJson(response, 200, { tables: await listTables() }),
  }),
  {
    matches: (url) => tableItemsPath.test(url.pathname),
    handle: (request, response, url) => {
      const handler = handlers[request.method];
      return handler ? handler(request, response, url) : false;
    },
  },
];
