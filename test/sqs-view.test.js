import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { eventTypeOf, MESSAGE_PAGE_SIZE, userEmailOf } from '../public/js/views/sqs.js';
import { deleteMessage, receiveMessages, sendMessage } from '../src/services/sqs-service.js';

test('sends a message to an SQS queue', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  let request;
  global.fetch = async (url) => {
    request = new URL(url);
    return new Response(`<SendMessageResponse><SendMessageResult>
      <MD5OfMessageBody>checksum</MD5OfMessageBody><MessageId>message-123</MessageId>
    </SendMessageResult></SendMessageResponse>`);
  };

  const result = await sendMessage(
    'http://localhost:4566/000000000000/events.fifo',
    '{"event":"created"}',
    { messageGroupId: 'events', deduplicationId: 'event-123' },
  );

  assert.equal(request.searchParams.get('Action'), 'SendMessage');
  assert.equal(
    request.searchParams.get('QueueUrl'),
    'http://localhost:4566/000000000000/events.fifo',
  );
  assert.equal(request.searchParams.get('MessageBody'), '{"event":"created"}');
  assert.equal(request.searchParams.get('MessageGroupId'), 'events');
  assert.equal(request.searchParams.get('MessageDeduplicationId'), 'event-123');
  assert.deepEqual(result, { messageId: 'message-123', md5: 'checksum' });
});

test('exposes the SQS send-message form and client API', async () => {
  const [view, api, routes] = await Promise.all([
    readFile(new URL('../public/js/views/sqs.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/sqs-routes.js', import.meta.url), 'utf8'),
  ]);
  assert.match(view, /id="sqs-send-form"/);
  assert.match(view, /id="open-sqs-send"/);
  assert.match(view, /id="sqs-send-dialog"/);
  assert.match(view, /sendDialog\.showModal\(\)/);
  assert.match(view, /messageGroupId/);
  assert.match(api, /sendMessage:/);
  assert.match(routes, /POST: addMessage/);
});

test('refreshes SQS messages in the background and reports completion', async () => {
  const view = await readFile(new URL('../public/js/views/sqs.js', import.meta.url), 'utf8');
  assert.match(view, /\{ background = false, notify = false \}/);
  assert.match(view, /refreshButton\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(view, /class="button-spinner"/);
  assert.match(view, /\{ background: true, notify: true \}/);
  assert.match(view, /setStatus\('Messages updated'\)/);
});

test('paginates filtered SQS messages ten at a time', async () => {
  const view = await readFile(new URL('../public/js/views/sqs.js', import.meta.url), 'utf8');
  assert.equal(MESSAGE_PAGE_SIZE, 10);
  assert.match(view, /visible\.slice\(pageStart, pageStart \+ MESSAGE_PAGE_SIZE\)/);
  assert.match(view, /aria-label="Message pagination"/);
  assert.match(view, /currentPage = 1;\s+renderMessages\(\);/);
});

test('refreshes an invalid peek receipt handle before deleting a message', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  const actions = [];
  global.fetch = async (url, options) => {
    if (options?.headers?.['X-Amz-Target']) return Response.json({});
    const request = new URL(url);
    const action = request.searchParams.get('Action');
    actions.push({ action, request });
    if (
      action === 'DeleteMessage' &&
      request.searchParams.get('ReceiptHandle') === 'peek-receipt'
    ) {
      return new Response('<Error><Code>ReceiptHandleIsInvalid</Code></Error>', { status: 400 });
    }
    if (action === 'ReceiveMessage') {
      return new Response(`<ReceiveMessageResponse><Message><MessageId>keep</MessageId><ReceiptHandle>keep-receipt</ReceiptHandle></Message>
        <Message><MessageId>delete-me</MessageId><ReceiptHandle>fresh-receipt</ReceiptHandle></Message></ReceiveMessageResponse>`);
    }
    return new Response('<ok/>');
  };

  await deleteMessage('http://localhost:4566/000000000000/events', 'delete-me', 'peek-receipt');

  assert.equal(actions.filter(({ action }) => action === 'DeleteMessage').length, 2);
  assert.ok(
    actions.some(
      ({ action, request }) =>
        action === 'DeleteMessage' && request.searchParams.get('ReceiptHandle') === 'fresh-receipt',
    ),
  );
  const restore = actions.find(({ action }) => action === 'ChangeMessageVisibilityBatch').request;
  assert.equal(
    restore.searchParams.get('ChangeMessageVisibilityBatchRequestEntry.1.ReceiptHandle'),
    'keep-receipt',
  );
  assert.equal(
    restore.searchParams.get('ChangeMessageVisibilityBatchRequestEntry.1.VisibilityTimeout'),
    '0',
  );
});

test('reads the sent timestamp from SQS system attributes', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  const requests = [];
  global.fetch = async (url, options) => {
    if (options?.headers?.['X-Amz-Target'])
      return Response.json(options.headers['X-Amz-Target'].endsWith('.Query') ? { Items: [] } : {});
    requests.push(url);
    if (url.includes('/_aws/sqs/messages')) return new Response('', { status: 404 });
    if (url.includes('Action=ChangeMessageVisibilityBatch'))
      return new Response('<ChangeMessageVisibilityBatchResponse/>');
    if (requests.filter((request) => request.includes('Action=ReceiveMessage')).length > 1) {
      return new Response(
        '<ReceiveMessageResponse><ReceiveMessageResult/></ReceiveMessageResponse>',
      );
    }
    return new Response(`<ReceiveMessageResponse><ReceiveMessageResult><Message>
      <MessageId>0754b895-46a6-4877-b7ef-39438abb6610</MessageId>
      <ReceiptHandle>receipt</ReceiptHandle><MD5OfBody>checksum</MD5OfBody>
      <Body>{&quot;eventType&quot;:&quot;course_created&quot;}</Body>
      <Attribute><Name>SenderId</Name><Value>sender</Value></Attribute>
      <Attribute><Name>SentTimestamp</Name><Value>1786492800000</Value></Attribute>
    </Message></ReceiveMessageResult></ReceiveMessageResponse>`);
  };

  const messages = await receiveMessages('http://localhost:4566/000000000000/events');

  assert.equal(messages.length, 1);
  assert.equal(messages[0].sentTimestamp, '1786492800000');
  assert.ok(
    requests
      .filter((url) => url.includes('Action=ReceiveMessage'))
      .every((url) => url.includes('AttributeName.1=All')),
  );
  assert.ok(
    requests.some(
      (url) =>
        url.includes('Action=ChangeMessageVisibilityBatch') && url.includes('VisibilityTimeout=0'),
    ),
  );
});

test('reads SQS message attributes used by notification envelopes', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (url, options) => {
    if (options?.headers?.['X-Amz-Target'])
      return Response.json(options.headers['X-Amz-Target'].endsWith('.Query') ? { Items: [] } : {});
    return new Response(`<ReceiveMessageResponse><ReceiveMessageResult><Message>
      <MessageId>welcome-message</MessageId><ReceiptHandle>receipt</ReceiptHandle>
      <Body>{&quot;event_type&quot;:&quot;guardian_account_created&quot;,&quot;data&quot;:{}}</Body>
      <MessageAttribute><Name>EventType</Name><Value><StringValue>guardian_account_created</StringValue><DataType>String</DataType></Value></MessageAttribute>
      <MessageAttribute><Name>UserId</Name><Value><StringValue>user-123</StringValue><DataType>String</DataType></Value></MessageAttribute>
    </Message></ReceiveMessageResult></ReceiveMessageResponse>`);
  };

  const [message] = await receiveMessages('http://localhost:4566/000000000000/notifications');

  assert.deepEqual(message.messageAttributes, {
    EventType: { dataType: 'String', value: 'guardian_account_created' },
    UserId: { dataType: 'String', value: 'user-123' },
  });
  assert.equal(message.json.event_type, 'guardian_account_created');
  assert.deepEqual(message.json.data, {});
});

test('reads subsequent batches and restores every message immediately', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  let receiveCount = 0;
  const restored = [];
  const receiveRequests = [];
  global.fetch = async (url, options) => {
    if (options?.headers?.['X-Amz-Target'])
      return Response.json(options.headers['X-Amz-Target'].endsWith('.Query') ? { Items: [] } : {});
    const request = new URL(url);
    if (request.pathname === '/_aws/sqs/messages') return new Response('', { status: 404 });
    if (request.searchParams.get('Action') === 'ChangeMessageVisibilityBatch') {
      restored.push(
        ...[...request.searchParams.entries()]
          .filter(([name]) => name.endsWith('.ReceiptHandle'))
          .map(([, value]) => value),
      );
      return new Response('<ChangeMessageVisibilityBatchResponse/>');
    }
    receiveCount += 1;
    receiveRequests.push(request);
    if (receiveCount > 2)
      return new Response(
        '<ReceiveMessageResponse><ReceiveMessageResult/></ReceiveMessageResponse>',
      );
    const start = receiveCount === 1 ? 0 : 10;
    const count = receiveCount === 1 ? 10 : 2;
    const messages = Array.from(
      { length: count },
      (_, index) =>
        `<Message><MessageId>message-${start + index}</MessageId><ReceiptHandle>receipt-${start + index}</ReceiptHandle><Body>{}</Body></Message>`,
    ).join('');
    return new Response(
      `<ReceiveMessageResponse><ReceiveMessageResult>${messages}</ReceiveMessageResult></ReceiveMessageResponse>`,
    );
  };

  const messages = await receiveMessages('http://localhost:4566/000000000000/events');

  assert.equal(messages.length, 12);
  assert.equal(receiveCount, 10);
  assert.ok(
    receiveRequests.every((request) => request.searchParams.get('VisibilityTimeout') === '60'),
  );
  assert.deepEqual(
    restored.sort(),
    Array.from({ length: 12 }, (_, index) => `receipt-${index}`).sort(),
  );
});

test('keeps cleaning later batches when an earlier visibility restore fails', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  let receiveCount = 0;
  let cleanupCount = 0;
  global.fetch = async (url) => {
    const request = new URL(url);
    if (request.pathname === '/_aws/sqs/messages') return new Response('', { status: 404 });
    if (request.searchParams.get('Action') === 'ChangeMessageVisibilityBatch') {
      cleanupCount += 1;
      return cleanupCount === 1 ? new Response('failed', { status: 500 }) : new Response('<ok/>');
    }
    receiveCount += 1;
    const messages =
      receiveCount <= 2
        ? Array.from(
            { length: 10 },
            (_, index) =>
              `<Message><MessageId>${receiveCount}-${index}</MessageId><ReceiptHandle>${receiveCount}-${index}</ReceiptHandle><Body>{}</Body></Message>`,
          ).join('')
        : '';
    return new Response(`<ReceiveMessageResponse>${messages}</ReceiveMessageResponse>`);
  };

  await assert.rejects(
    receiveMessages('http://localhost:4566/000000000000/events'),
    /LocalStack HTTP 500/,
  );
  assert.equal(cleanupCount, 2);
});

test('uses the LocalStack peek endpoint without consuming or hiding messages', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  const requests = [];
  global.fetch = async (url, options) => {
    if (options?.headers?.['X-Amz-Target'])
      return Response.json(options.headers['X-Amz-Target'].endsWith('.Query') ? { Items: [] } : {});
    requests.push(new URL(url));
    return new Response(`<ReceiveMessageResponse><ReceiveMessageResult>
      <Message><MessageId>new-message</MessageId><ReceiptHandle>receipt</ReceiptHandle><Body>{}</Body>
      <Attribute><Name>SentTimestamp</Name><Value>1786492800000</Value></Attribute></Message>
    </ReceiveMessageResult></ReceiveMessageResponse>`);
  };

  const messages = await receiveMessages('http://localhost:4566/000000000000/events');

  assert.equal(messages.length, 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].pathname, '/_aws/sqs/messages');
  assert.equal(requests[0].searchParams.get('ShowInvisible'), 'true');
  assert.equal(requests[0].searchParams.get('ShowDelayed'), 'true');
});

test('identifies common SQS event type fields', () => {
  assert.equal(eventTypeOf({ json: { 'detail-type': 'Order created' } }), 'Order created');
  assert.equal(eventTypeOf({ json: { eventType: 'invoice.paid' } }), 'invoice.paid');
  assert.equal(eventTypeOf({ json: { type: 'user.updated' } }), 'user.updated');
});

test('uses EventType message attributes when a welcome body has no event type', () => {
  assert.equal(
    eventTypeOf({
      json: { data: {} },
      messageAttributes: {
        EventType: { dataType: 'String', value: 'independent_student_account_created' },
      },
    }),
    'independent_student_account_created',
  );
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

test('does not show a redundant JSON format badge in message cards', async () => {
  const view = await readFile(new URL('../public/js/views/sqs.js', import.meta.url), 'utf8');
  assert.doesNotMatch(view, /class="type-badge"/);
});

test('identifies available user emails in common payload shapes', () => {
  assert.equal(userEmailOf({ json: { userEmail: 'one@example.com' } }), 'one@example.com');
  assert.equal(
    userEmailOf({ json: { detail: { user: { email: 'two@example.com' } } } }),
    'two@example.com',
  );
  assert.equal(
    userEmailOf({
      json: { Message: JSON.stringify({ data: { user_email: 'three@example.com' } }) },
    }),
    'three@example.com',
  );
  assert.equal(userEmailOf({ json: { noUser: true } }), '');
});
