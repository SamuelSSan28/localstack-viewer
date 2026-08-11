import { marshall, unmarshall } from '../lib/dynamo-codec.js';
import { dynamoRequest } from '../lib/localstack.js';

export async function listTables() {
  return (await dynamoRequest('ListTables')).TableNames || [];
}

export async function getTable(tableName) {
  const [description, scan] = await Promise.all([
    dynamoRequest('DescribeTable', { TableName: tableName }),
    dynamoRequest('Scan', { TableName: tableName, Limit: 100 }),
  ]);
  return {
    keys: description.Table.KeySchema.map((key) => key.AttributeName),
    items: (scan.Items || []).map(unmarshall),
    types: (scan.Items || []).map((item) => Object.fromEntries(
      Object.entries(item).map(([name, value]) => [name, Object.keys(value)[0]]),
    )),
    count: scan.Count || 0,
  };
}

export async function saveItem(tableName, item, types = {}) {
  await dynamoRequest('PutItem', { TableName: tableName, Item: marshall(item, types) });
  return item;
}

export async function deleteItem(tableName, key) {
  await dynamoRequest('DeleteItem', { TableName: tableName, Key: marshall(key) });
}
