import { localstackRequest, xmlValues } from '../lib/localstack.js';

async function sqs(action, parameters = {}) {
  const query = new URLSearchParams({ Action: action, Version: '2012-11-05', ...parameters });
  return (await localstackRequest(`/?${query}`)).text();
}

export async function listQueues() {
  const xml = await sqs('ListQueues');
  return xmlValues(xml, 'QueueUrl').map((url) => ({ name: url.split('/').pop(), url }));
}

export async function receiveMessages(queueUrl) {
  const xml = await sqs('ReceiveMessage', {
    QueueUrl: queueUrl,
    MaxNumberOfMessages: '10',
    VisibilityTimeout: '0',
    WaitTimeSeconds: '0',
    AttributeName: 'All',
    MessageAttributeName: 'All',
  });
  const blocks = xmlValues(xml, 'Message');
  return blocks.map((block) => {
    const body = xmlValues(block, 'Body')[0] || '';
    let json = null;
    try { json = JSON.parse(body); } catch { /* Body is plain text. */ }
    return {
      id: xmlValues(block, 'MessageId')[0],
      md5: xmlValues(block, 'MD5OfBody')[0],
      receiptHandle: xmlValues(block, 'ReceiptHandle')[0],
      body,
      json,
    };
  });
}

export async function deleteMessage(queueUrl, receiptHandle) {
  await sqs('DeleteMessage', { QueueUrl: queueUrl, ReceiptHandle: receiptHandle });
}
