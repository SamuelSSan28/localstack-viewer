import { badRequest } from '../errors.js';

export function required(value, name) {
  if (!value) throw badRequest(`${name} is required`);
  return value;
}

export function exactRoute(pathname, handlers) {
  return {
    matches: (url) => url.pathname === pathname,
    handle: (request, response, url) => {
      const handler = handlers[request.method];
      return handler ? handler(request, response, url) : false;
    },
  };
}
