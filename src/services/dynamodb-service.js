import { marshall, unmarshall } from '../lib/dynamo-codec.js';
import { dynamoRequest } from '../lib/localstack.js';
import { messageStoreTable } from './sqs-message-store.js';

export async function listTables() {
  return ((await dynamoRequest('ListTables')).TableNames || []).filter((tableName) => tableName !== messageStoreTable);
}

function attributeSchema(value) {
  const type = Object.keys(value)[0];
  if (type === 'M') return { type, fields: Object.fromEntries(Object.entries(value.M).map(([name, child]) => [name, attributeSchema(child)])) };
  if (type === 'L') return { type, items: value.L.map(attributeSchema) };
  return { type };
}

async function scanAll(tableName) {
  const items = [];
  let startKey;
  do {
    const page = await dynamoRequest('Scan', { TableName: tableName, ...(startKey ? { ExclusiveStartKey: startKey } : {}) });
    items.push(...(page.Items || []));
    startKey = page.LastEvaluatedKey;
  } while (startKey && Object.keys(startKey).length);
  return items;
}

export async function getTable(tableName) {
  const [description, rawItems] = await Promise.all([
    dynamoRequest('DescribeTable', { TableName: tableName }),
    scanAll(tableName),
  ]);
  return {
    keys: description.Table.KeySchema.map((key) => key.AttributeName),
    items: rawItems.map(unmarshall),
    types: rawItems.map((item) => Object.fromEntries(
      Object.entries(item).map(([name, value]) => [name, Object.keys(value)[0]]),
    )),
    schemas: rawItems.map((item) => Object.fromEntries(
      Object.entries(item).map(([name, value]) => [name, attributeSchema(value)]),
    )),
    count: rawItems.length,
  };
}

export async function saveItem(tableName, item, schema = {}) {
  await dynamoRequest('PutItem', { TableName: tableName, Item: marshall(item, schema) });
  return item;
}

export async function deleteItem(tableName, key, schema = {}) {
  await dynamoRequest('DeleteItem', { TableName: tableName, Key: marshall(key, schema) });
}
