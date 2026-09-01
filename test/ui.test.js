import assert from 'node:assert/strict';
import test from 'node:test';
import { errorPresentation } from '../public/js/ui.js';

test('turns a disabled LocalStack service error into actionable content', () => {
  const state = errorPresentation(
    new Error(
      `LocalStack HTTP 501: {"__type":"InternalFailure","message":"Service 'events' is not enabled. Please check your 'SERVICES' configuration variable."}`,
    ),
  );

  assert.equal(state.eyebrow, 'SERVICE UNAVAILABLE');
  assert.equal(state.title, 'EventBridge is not enabled');
  assert.match(state.message, /LocalStack is running/);
  assert.equal(state.hint, 'Add events to your SERVICES configuration.');
});

test('provides a friendly connection message without discarding technical details', () => {
  const state = errorPresentation(new Error('LocalStack HTTP 503: upstream unavailable'));

  assert.equal(state.title, 'LocalStack is unavailable');
  assert.equal(state.detail, 'LocalStack HTTP 503: upstream unavailable');
});
