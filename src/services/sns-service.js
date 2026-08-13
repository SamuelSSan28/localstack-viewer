import { localstackRequest, xmlValues } from '../lib/localstack.js';

async function sns(action, parameters = {}) {
  const query = new URLSearchParams({ Action: action, Version: '2010-03-31', ...parameters });
  return (await localstackRequest(`/?${query}`)).text();
}

export async function listTopics() {
  const xml = await sns('ListTopics');
  return xmlValues(xml, 'TopicArn').map((arn) => ({ name: arn.split(':').pop(), arn }));
}

export async function getTopic(arn) {
  const xml = await sns('ListSubscriptionsByTopic', { TopicArn: arn });
  const blocks = xmlValues(xml, 'member');
  return {
    subscriptions: blocks
      .map((block) => ({
        arn: xmlValues(block, 'SubscriptionArn')[0],
        protocol: xmlValues(block, 'Protocol')[0],
        endpoint: xmlValues(block, 'Endpoint')[0],
        owner: xmlValues(block, 'Owner')[0],
      }))
      .filter((subscription) => subscription.protocol),
  };
}

export async function publishMessage(topicArn, message, subject) {
  const xml = await sns('Publish', {
    TopicArn: topicArn,
    Message: message,
    ...(subject ? { Subject: subject } : {}),
  });
  return { messageId: xmlValues(xml, 'MessageId')[0] };
}
