import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendJson } from './http.js';
import { localstack } from './lib/localstack.js';
import { logger } from './logger.js';
import { routeApi } from './router.js';

const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};
export const server = createServer(async (request, response) => {
  const startedAt = performance.now();
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    logger.info('API request started', { method: request.method, path: url.pathname });
    response.once('finish', () =>
      logger.info('API request completed', {
        method: request.method,
        path: url.pathname,
        status: response.statusCode,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      }),
    );
  }
  try {
    if (url.pathname.startsWith('/api/')) {
      const handled = await routeApi(request, response, url);
      if (handled !== false) return;
      return sendJson(response, 404, { error: 'Endpoint not found' });
    }
  } catch (error) {
    logger.error('API request failed', error, {
      method: request.method,
      path: url.pathname,
      status: error.status || 502,
    });
    return sendJson(response, error.status || 502, { error: error.message });
  }

  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.resolve(publicRoot, `.${pathname}`);
  if (!file.startsWith(`${publicRoot}${path.sep}`))
    return sendJson(response, 403, { error: 'Access denied' });
  try {
    const fileStat = await stat(file);
    if (!fileStat.isFile()) return sendJson(response, 404, { error: 'Not found' });
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream',
    });
    await pipeline(createReadStream(file), response);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') {
      logger.error('Static file response failed', error, { method: request.method, path: url.pathname });
    }
    if (!response.headersSent) sendJson(response, 404, { error: 'Not found' });
    else response.destroy();
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8888);
  server.on('error', (error) => logger.error('HTTP server failed', error, { port }));
  server.listen(port, '0.0.0.0', () =>
    logger.info('LocalStack Viewer started', {
      address: `http://0.0.0.0:${port}`,
      localstackEndpoint: localstack.endpoint,
      region: localstack.region,
      logLevel: process.env.LOG_LEVEL || 'info',
    }),
  );
}
