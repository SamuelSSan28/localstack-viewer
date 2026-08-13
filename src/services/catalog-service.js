import { dynamoRequest, localstack, localstackRequest, xmlValues } from '../lib/localstack.js';

const definitions = [
  ['s3', 'S3 Buckets', async () => xmlValues(await (await localstackRequest('/')).text(), 'Name')],
  [
    'sqs',
    'SQS Queues',
    async () =>
      xmlValues(
        await (await localstackRequest('/?Action=ListQueues&Version=2012-11-05')).text(),
        'QueueUrl',
      ),
  ],
  ['dynamodb', 'DynamoDB Tables', async () => (await dynamoRequest('ListTables')).TableNames || []],
  [
    'lambda',
    'Lambda Functions',
    async () =>
      ((await (await localstackRequest('/2015-03-31/functions/')).json()).Functions || []).map(
        (item) => item.FunctionName,
      ),
  ],
  [
    'sns',
    'SNS Topics',
    async () =>
      xmlValues(
        await (await localstackRequest('/?Action=ListTopics&Version=2010-03-31')).text(),
        'TopicArn',
      ),
  ],
  [
    'ses',
    'SES Emails',
    async () => (await (await localstackRequest('/_aws/ses')).json()).messages || [],
  ],
];

export async function getCatalog() {
  const services = await Promise.all(
    definitions.map(async ([id, label, load]) => {
      try {
        const resources = await load();
        return { id, label, status: 'available', count: resources.length };
      } catch (error) {
        return { id, label, status: 'unavailable', count: 0, error: error.message };
      }
    }),
  );
  return { ...localstack, updatedAt: new Date().toISOString(), services };
}
