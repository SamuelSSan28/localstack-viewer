import { localstackRequest, xmlValues } from '../lib/localstack.js';
import { deleteStoredMessage, storedMessages, storeMessages } from './sqs-message-store.js';

async function sqs(action, parameters = {}) {
  const query = new URLSearchParams({ Action: action, Version: '2012-11-05', ...parameters });
  return (await localstackRequest(`/?${query}`)).text();
}

const messageAttribute = (block, name) => {
  for (const attribute of xmlValues(block, 'Attribute')) {
    if (xmlValues(attribute, 'Name')[0] === name) return xmlValues(attribute, 'Value')[0] || null;
  }
  return null;
};

const messageAttributes = (block) =>
  Object.fromEntries(
    xmlValues(block, 'MessageAttribute').flatMap((attribute) => {
      const name = xmlValues(attribute, 'Name')[0];
      if (!name) return [];
      const valueBlock = xmlValues(attribute, 'Value')[0] || '';
      const value =
        xmlValues(valueBlock, 'StringValue')[0] ?? xmlValues(valueBlock, 'BinaryValue')[0] ?? '';
      return [
        [
          name,
          {
            dataType: xmlValues(valueBlock, 'DataType')[0] || 'String',
            value,
          },
        ],
      ];
    }),
  );

export async function listQueues() {
  const xml = await sqs('ListQueues');
  return xmlValues(xml, 'QueueUrl').map((url) => ({ name: url.split('/').pop(), url }));
}

export async function sendMessage(queueUrl, message, options = {}) {
  const xml = await sqs('SendMessage', {
    QueueUrl: queueUrl,
    MessageBody: message,
    ...(options.messageGroupId ? { MessageGroupId: options.messageGroupId } : {}),
    ...(options.deduplicationId
      ? { MessageDeduplicationId: options.deduplicationId }
      : {}),
  });
  return {
    messageId: xmlValues(xml, 'MessageId')[0],
    md5: xmlValues(xml, 'MD5OfMessageBody')[0],
  };
}

async function peekMessages(queueUrl) {
  const query = new URLSearchParams({
    QueueUrl: queueUrl,
    ShowInvisible: 'true',
    ShowDelayed: 'true',
  });
  const response = await localstackRequest(`/_aws/sqs/messages?${query}`);
  return xmlValues(await response.text(), 'Message');
}

async function receiveMessageBlocks(queueUrl) {
  // LocalStack's developer endpoint reads the queue without changing message
  // visibility. Fall back to the public SQS API for older LocalStack versions.
  try {
    return await peekMessages(queueUrl);
  } catch (error) {
    if (!String(error.message).includes('HTTP 404')) throw error;
  }

  // Temporarily hide each batch so the next receive can move past it. Every
  // receipt is restored below, and SQS also restores it after 60 seconds if
  // the scan is interrupted. Receiving never deletes a message.
  const blocks = [];
  try {
    for (let batch = 0; batch < 10; batch += 1) {
      const xml = await sqs('ReceiveMessage', {
        QueueUrl: queueUrl,
        MaxNumberOfMessages: '10',
        VisibilityTimeout: '60',
        WaitTimeSeconds: '0',
        'AttributeName.1': 'All',
        'MessageAttributeName.1': 'All',
      });
      const received = xmlValues(xml, 'Message');
      blocks.push(...received);
    }
  } finally {
    let cleanupError;
    for (let offset = 0; offset < blocks.length; offset += 10) {
      const parameters = { QueueUrl: queueUrl };
      blocks.slice(offset, offset + 10).forEach((block, index) => {
        parameters[`ChangeMessageVisibilityBatchRequestEntry.${index + 1}.Id`] = String(index);
        parameters[`ChangeMessageVisibilityBatchRequestEntry.${index + 1}.ReceiptHandle`] =
          xmlValues(block, 'ReceiptHandle')[0];
        parameters[`ChangeMessageVisibilityBatchRequestEntry.${index + 1}.VisibilityTimeout`] = '0';
      });
      try {
        await sqs('ChangeMessageVisibilityBatch', parameters);
      } catch (error) {
        cleanupError ||= error;
      }
    }
    if (cleanupError) throw cleanupError;
  }
  return blocks;
}

export async function receiveMessages(queueUrl) {
  const blocks = await receiveMessageBlocks(queueUrl);
  const uniqueBlocks = [
    ...new Map(blocks.map((block) => [xmlValues(block, 'MessageId')[0], block])).values(),
  ];
  const liveMessages = uniqueBlocks.map((block) => {
    const body = xmlValues(block, 'Body')[0] || '';
    let json = null;
    try {
      json = JSON.parse(body);
    } catch {
      /* Body is plain text. */
    }
    return {
      id: xmlValues(block, 'MessageId')[0],
      md5: xmlValues(block, 'MD5OfBody')[0],
      receiptHandle: xmlValues(block, 'ReceiptHandle')[0],
      sentTimestamp: messageAttribute(block, 'SentTimestamp'),
      messageAttributes: messageAttributes(block),
      body,
      json,
      archived: false,
    };
  });
  await storeMessages(queueUrl, liveMessages);
  const archivedMessages = await storedMessages(queueUrl);
  return [
    ...new Map(
      [...archivedMessages, ...liveMessages].map((message) => [message.id, message]),
    ).values(),
  ];
}

export async function deleteMessage(queueUrl, messageId, receiptHandle) {
  if (receiptHandle) {
    try {
      await sqs('DeleteMessage', { QueueUrl: queueUrl, ReceiptHandle: receiptHandle });
    } catch (error) {
      // The LocalStack developer endpoint used to peek at messages can return
      // receipt handles that the public SQS API does not accept. Obtain a fresh
      // handle without losing or leaving unrelated messages invisible.
      if (!String(error.message).includes('ReceiptHandleIsInvalid')) throw error;
      await deleteMessageById(queueUrl, messageId);
    }
  }
  await deleteStoredMessage(queueUrl, messageId);
}

async function deleteMessageById(queueUrl, messageId) {
  const received = [];
  let target;
  try {
    for (let batch = 0; batch < 10 && !target; batch += 1) {
      const xml = await sqs('ReceiveMessage', {
        QueueUrl: queueUrl,
        MaxNumberOfMessages: '10',
        VisibilityTimeout: '60',
        WaitTimeSeconds: '0',
      });
      const messages = xmlValues(xml, 'Message');
      if (!messages.length) break;
      received.push(...messages);
      target = messages.find((block) => xmlValues(block, 'MessageId')[0] === messageId);
    }
    if (!target) throw new Error(`SQS message ${messageId} is no longer available for deletion`);
    await sqs('DeleteMessage', {
      QueueUrl: queueUrl,
      ReceiptHandle: xmlValues(target, 'ReceiptHandle')[0],
    });
  } finally {
    const untouched = received.filter((block) => block !== target);
    for (let offset = 0; offset < untouched.length; offset += 10) {
      const parameters = { QueueUrl: queueUrl };
      untouched.slice(offset, offset + 10).forEach((block, index) => {
        parameters[`ChangeMessageVisibilityBatchRequestEntry.${index + 1}.Id`] = String(index);
        parameters[`ChangeMessageVisibilityBatchRequestEntry.${index + 1}.ReceiptHandle`] =
          xmlValues(block, 'ReceiptHandle')[0];
        parameters[`ChangeMessageVisibilityBatchRequestEntry.${index + 1}.VisibilityTimeout`] = '0';
      });
      await sqs('ChangeMessageVisibilityBatch', parameters);
    }
  }
}
