import { localstackRequest } from '../lib/localstack.js';

export async function listEmails() {
  const data = await (await localstackRequest('/_aws/ses')).json();
  return (data.messages || []).map((message, index) => ({
    id: message.id || message.Id || String(index),
    from: message.source || message.Source || message.from || '—',
    to: message.destination?.ToAddresses || message.Destination?.ToAddresses || message.to || [],
    subject: message.subject || message.Subject || message.Content?.Simple?.Subject?.Data || '(sem assunto)',
    body: message.body?.text_part || message.body?.html_part || message.Body?.text_part || message.Body?.html_part
      || message.body || message.Body || message.Content?.Simple?.Body?.Text?.Data
      || message.Content?.Simple?.Body?.Html?.Data || '',
    timestamp: message.timestamp || message.Timestamp || null,
    raw: message,
  })).reverse();
}
