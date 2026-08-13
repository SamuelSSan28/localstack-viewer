import assert from 'node:assert/strict';
import test from 'node:test';
import { getTable, listTables } from '../src/services/dynamodb-service.js';

test('hides the internal SQS message archive from the DynamoDB table list', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () =>
    Response.json({
      TableNames: ['customers', 'localstack-viewer-sqs-messages', 'orders'],
    });

  assert.deepEqual(await listTables(), ['customers', 'orders']);
});

test('reads every DynamoDB scan page and returns lossless type schemas', async (context) => {
  const originalFetch = global.fetch;
  context.after(() => {
    global.fetch = originalFetch;
  });
  let scanRequests = 0;
  global.fetch = async (_url, options) => {
    const action = options.headers['X-Amz-Target'].split('.').pop();
    if (action === 'DescribeTable') {
      return Response.json({ Table: { KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }] } });
    }
    const body = JSON.parse(options.body);
    scanRequests += 1;
    if (!body.ExclusiveStartKey) {
      return Response.json({
        Items: [{ id: { N: '9007199254740993' } }],
        LastEvaluatedKey: { id: { N: '9007199254740993' } },
      });
    }
    return Response.json({
      Items: [
        { id: { N: '9007199254740994' }, profile: { M: { score: { N: '1.0000000000000001' } } } },
      ],
    });
  };

  const result = await getTable('users');
  assert.equal(scanRequests, 2);
  assert.equal(result.count, 2);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ['9007199254740993', '9007199254740994'],
  );
  assert.deepEqual(result.schemas[1].profile, { type: 'M', fields: { score: { type: 'N' } } });
});
