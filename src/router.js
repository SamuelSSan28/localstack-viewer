import { dynamodbRoutes } from './routes/dynamodb-routes.js';
import { eventBridgeRoutes } from './routes/eventbridge-routes.js';
import { s3Routes } from './routes/s3-routes.js';
import { snsRoutes } from './routes/sns-routes.js';
import { sqsRoutes } from './routes/sqs-routes.js';
import { staticRoutes } from './routes/static-routes.js';

const routes = [...staticRoutes, ...s3Routes, ...sqsRoutes, ...snsRoutes, ...eventBridgeRoutes, ...dynamodbRoutes];

export async function routeApi(request, response, url) {
  const route = routes.find((candidate) => candidate.matches(url));
  if (!route) return false;

  return route.handle(request, response, url);
}
