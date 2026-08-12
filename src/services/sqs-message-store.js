import { marshall, unmarshall } from '../lib/dynamo-codec.js';
import { dynamoRequest } from '../lib/localstack.js';

export const messageStoreTable = process.env.SQS_MESSAGE_STORE_TABLE || 'localstack-viewer-sqs-messages';

let tableReady;

async function ensureTable() {
  try {
    await dynamoRequest('DescribeTable', { TableName: messageStoreTable });
  } catch (error) {
    if (!String(error.message).includes('ResourceNotFoundException')) throw error;
    try {
      await dynamoRequest('CreateTable', {
        TableName: messageStoreTable,
        AttributeDefinitions: [
          { AttributeName: 'queueUrl', AttributeType: 'S' },
          { AttributeName: 'messageId', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'queueUrl', KeyType: 'HASH' },
          { AttributeName: 'messageId', KeyType: 'RANGE' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      });
    } catch (createError) {
      if (!String(createError.message).includes('ResourceInUseException')) throw createError;
    }
  }
}

const ready = async () => {
  tableReady ||= ensureTable().catch((error) => { tableReady = undefined; throw error; });
  return tableReady;
};

export async function storeMessages(queueUrl, messages) {
  if (!messages.length) return;
  await ready();
  await Promise.all(messages.map((message) => dynamoRequest('PutItem', {
    TableName: messageStoreTable,
    Item: marshall(Object.fromEntries(Object.entries({ queueUrl, messageId: message.id, ...message })
      .filter(([, value]) => value !== undefined))),
  })));
}

export async function storedMessages(queueUrl) {
  await ready();
  const result = await dynamoRequest('Query', {
    TableName: messageStoreTable,
    KeyConditionExpression: 'queueUrl = :queueUrl',
    ExpressionAttributeValues: marshall({ ':queueUrl': queueUrl }),
  });
  return (result.Items || []).map(({ queueUrl: _queueUrl, messageId: _messageId, ...item }) => ({ ...unmarshall(item), archived: true }));
}

export async function deleteStoredMessage(queueUrl, messageId) {
  await ready();
  await dynamoRequest('DeleteItem', {
    TableName: messageStoreTable,
    Key: marshall({ queueUrl, messageId }),
  });
}
