import assert from 'node:assert/strict';
import test from 'node:test';
import { errorPresentation, showError } from '../public/js/ui.js';

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

test('recognizes every LocalStack service exposed by the viewer', () => {
  const services = {
    events: 'EventBridge',
    dynamodb: 'DynamoDB',
    s3: 'S3',
    ses: 'SES',
    sns: 'SNS',
    sqs: 'SQS',
  };

  for (const [id, label] of Object.entries(services)) {
    const state = errorPresentation(new Error(`Service '${id}' is not enabled`));
    assert.equal(state.title, `${label} is not enabled`);
    assert.equal(state.hint, `Add ${id} to your SERVICES configuration.`);
  }
});

test('renders nested service failures on the global application surface', () => {
  const retryButton = {};
  const globalSurface = {
    innerHTML: '',
    querySelector: () => retryButton,
  };
  const nestedContainer = { innerHTML: 'resource content' };
  const previousDocument = global.document;
  global.document = { querySelector: (selector) => (selector === '#view' ? globalSurface : null) };

  try {
    const retry = () => {};
    showError(nestedContainer, new Error(`Service 'sqs' is not enabled`), retry);
    assert.match(globalSurface.innerHTML, /SQS is not enabled/);
    assert.equal(nestedContainer.innerHTML, 'resource content');
    assert.equal(retryButton.onclick, retry);
  } finally {
    global.document = previousDocument;
  }
});
