import assert from 'node:assert/strict';
import test from 'node:test';
import { eventTypeOf, userEmailOf } from '../public/js/views/sqs.js';

test('identifies common SQS event type fields', () => {
  assert.equal(eventTypeOf({ json: { 'detail-type': 'Order created' } }), 'Order created');
  assert.equal(eventTypeOf({ json: { eventType: 'invoice.paid' } }), 'invoice.paid');
  assert.equal(eventTypeOf({ json: { type: 'user.updated' } }), 'user.updated');
});

test('identifies event types inside SNS message envelopes', () => {
  const message = {
    json: {
      Type: 'Notification',
      Message: JSON.stringify({ event_type: 'shipment.sent' }),
    },
  };

  assert.equal(eventTypeOf(message), 'shipment.sent');
});

test('labels untyped JSON and text messages clearly', () => {
  assert.equal(eventTypeOf({ json: { payload: true } }), 'JSON event');
  assert.equal(eventTypeOf({ json: null }), 'Text message');
});

test('identifies available user emails in common payload shapes', () => {
  assert.equal(userEmailOf({ json: { userEmail: 'one@example.com' } }), 'one@example.com');
  assert.equal(userEmailOf({ json: { detail: { user: { email: 'two@example.com' } } } }), 'two@example.com');
  assert.equal(userEmailOf({ json: { Message: JSON.stringify({ data: { user_email: 'three@example.com' } }) } }), 'three@example.com');
  assert.equal(userEmailOf({ json: { noUser: true } }), '');
});
