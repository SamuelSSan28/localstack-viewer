import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { listEventBuses, listRules, putEvent } from '../src/services/eventbridge-service.js';

test('lists EventBridge buses and rules with their targets', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  global.fetch = async (_url, options) => {
    const action = options.headers['X-Amz-Target'];
    if (action.endsWith('.ListEventBuses')) return Response.json({ EventBuses: [{ Name: 'default', Arn: 'arn:aws:events:us-east-1:000000000000:event-bus/default' }] });
    if (action.endsWith('.ListRules')) return Response.json({ Rules: [{ Name: 'orders', Arn: 'rule-arn', State: 'ENABLED', EventPattern: '{"source":["orders"]}' }] });
    return Response.json({ Targets: [{ Id: 'queue', Arn: 'arn:aws:sqs:us-east-1:000000000000:orders' }] });
  };

  assert.deepEqual(await listEventBuses(), [{ name: 'default', arn: 'arn:aws:events:us-east-1:000000000000:event-bus/default' }]);
  const [rule] = await listRules('default');
  assert.equal(rule.name, 'orders');
  assert.deepEqual(rule.eventPattern, { source: ['orders'] });
  assert.equal(rule.targets[0].id, 'queue');
});

test('publishes a structured EventBridge event', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  let request;
  global.fetch = async (_url, options) => {
    request = { target: options.headers['X-Amz-Target'], body: JSON.parse(options.body) };
    return Response.json({ FailedEntryCount: 0, Entries: [{ EventId: 'event-123' }] });
  };
  const result = await putEvent('custom', { source: 'app.orders', detailType: 'Order created', detail: { id: 42 } });
  assert.equal(request.target, 'AWSEvents.PutEvents');
  assert.deepEqual(request.body.Entries[0], { EventBusName: 'custom', Source: 'app.orders', DetailType: 'Order created', Detail: '{"id":42}' });
  assert.deepEqual(result, { eventId: 'event-123', failedEntryCount: 0 });
});

test('wires the EventBridge navigation, UI and client API', async () => {
  const [html, app, api, view] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/views/eventbridge.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /data-view="eventbridge"/);
  assert.match(app, /renderEventBridge/);
  assert.match(api, /putEvent:/);
  assert.match(view, /id="eventbridge-form"/);
  assert.match(view, /Event pattern/);
  assert.match(view, /Targets/);
});
