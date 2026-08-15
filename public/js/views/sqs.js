import { api } from '../api.js';
import { escapeHtml, setStatus, showError, showLoading } from '../ui.js';

let activeQueue;
export const MESSAGE_PAGE_SIZE = 10;

export const eventTypeOf = (message) => {
  const attributeEventType =
    message.messageAttributes?.EventType?.value || message.messageAttributes?.event_type?.value;
  if (!message.json || Array.isArray(message.json))
    return attributeEventType || (message.json ? 'JSON event' : 'Text message');
  const payload =
    message.json.Message && typeof message.json.Message === 'string'
      ? (() => {
          try {
            return JSON.parse(message.json.Message);
          } catch {
            return null;
          }
        })()
      : null;
  const source = payload || message.json;
  const eventType =
    source['detail-type'] ||
    source.eventType ||
    source.event_type ||
    source.type ||
    source.Type ||
    source.event ||
    source.Event;
  return typeof eventType === 'string' || typeof eventType === 'number'
    ? String(eventType)
    : attributeEventType || 'JSON event';
};

const decodedPayloadOf = (message) => {
  if (!message.json || Array.isArray(message.json)) return message.json;
  if (typeof message.json.Message !== 'string') return message.json;
  try {
    return JSON.parse(message.json.Message);
  } catch {
    return message.json;
  }
};

export const userEmailOf = (message) => {
  const payload = decodedPayloadOf(message);
  if (!payload || typeof payload !== 'object') return '';
  const candidates = [
    payload,
    payload.detail,
    payload.data,
    payload.user,
    payload.detail?.user,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const email = candidate.userEmail || candidate.user_email || candidate.email;
    if (typeof email === 'string' && email.trim()) return email.trim();
  }
  return '';
};

const timestampOf = (message) => {
  const candidate =
    message.sentTimestamp ||
    message.json?.time ||
    message.json?.timestamp ||
    message.json?.Timestamp ||
    message.json?.createdAt;
  if (!candidate) return 0;
  const milliseconds = /^\d+$/.test(String(candidate)) ? Number(candidate) : Date.parse(candidate);
  return Number.isFinite(milliseconds) ? milliseconds : 0;
};

const formattedTime = (message) => {
  const timestamp = timestampOf(message);
  return timestamp ? new Date(timestamp).toLocaleString() : 'Time unavailable';
};

const bodyView = (message) =>
  message.json
    ? `<pre class="json-viewer"><code>${escapeHtml(JSON.stringify(message.json, null, 2))}</code></pre>`
    : `<pre class="message-text">${escapeHtml(message.body)}</pre>`;

const attributesView = (message) => {
  const attributes = Object.entries(message.messageAttributes || {});
  if (!attributes.length) return '';
  return `<dt>Message attributes</dt><dd><dl class="message-attributes">${attributes
    .map(
      ([name, attribute]) =>
        `<dt>${escapeHtml(name)}</dt><dd><code>${escapeHtml(attribute.value)}</code> <small>${escapeHtml(attribute.dataType)}</small></dd>`,
    )
    .join('')}</dl></dd>`;
};

const messageCard = (message, originalIndex) => `<article class="message-card">
  <div class="message-meta">
    <span class="event-type-badge" title="Event type">${escapeHtml(eventTypeOf(message))}</span>
    ${userEmailOf(message) ? `<span class="message-user" title="User email">${escapeHtml(userEmailOf(message))}</span>` : ''}
    <time datetime="${timestampOf(message) ? new Date(timestampOf(message)).toISOString() : ''}">${escapeHtml(formattedTime(message))}</time>
    <code title="${escapeHtml(message.id)}">${escapeHtml(message.id)}</code>
    <button class="danger-link" data-remove="${originalIndex}">Delete</button>
  </div>
  ${bodyView(message)}
  <details><summary>Technical metadata</summary><dl><dt>Message ID</dt><dd>${escapeHtml(message.id)}</dd><dt>MD5</dt><dd>${escapeHtml(message.md5)}</dd><dt>Sent</dt><dd>${escapeHtml(formattedTime(message))}</dd>${attributesView(message)}</dl></details>
</article>`;

async function loadMessages(container, queue, { background = false, notify = false } = {}) {
  activeQueue = queue;
  const content = container.querySelector('#queue-content');
  const refreshButton = background ? content.querySelector('#refresh-messages') : null;
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.setAttribute('aria-busy', 'true');
    refreshButton.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> Refreshing…';
  } else if (!background) {
    showLoading(content, `Reading messages from ${queue.name}…`);
  }
  try {
    const { messages } = await api.messages(queue.url);
    const eventTypes = [...new Set(messages.map(eventTypeOf))].sort((a, b) => a.localeCompare(b));
    const userEmails = [...new Set(messages.map(userEmailOf).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
    const fifo = queue.url.endsWith('.fifo');
    content.innerHTML = `<div class="table-toolbar"><div><span class="eyebrow">SQS QUEUE</span><h2>${escapeHtml(queue.name)}</h2><p>${messages.length} visible message(s), without changing visibility.</p></div><div class="table-toolbar-actions"><button class="button secondary" id="refresh-messages">↻ Refresh</button><button class="button primary" id="open-sqs-send">＋ Send a message</button></div></div>
      <div class="message-tools" aria-label="Message filters">
        <label><span>Search messages</span><input id="message-search" type="search" placeholder="Event type, ID or payload…"></label>
        <label><span>Event type</span><span class="select-control"><select id="event-filter"><option value="">All event types</option>${eventTypes.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('')}</select></span></label>
        <label><span>User email</span><span class="select-control"><select id="email-filter"><option value="">All users</option>${userEmails.map((email) => `<option value="${escapeHtml(email)}">${escapeHtml(email)}</option>`).join('')}</select></span></label>
        <label><span>Sort by</span><span class="select-control"><select id="message-sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="type">Event type A–Z</option></select></span></label>
        <span class="message-results" id="message-results" aria-live="polite"></span>
      </div>
      <div class="message-grid" id="message-grid"></div>
      <dialog class="sqs-send-dialog" id="sqs-send-dialog"><form id="sqs-send-form"><div class="dialog-head"><div><span class="eyebrow">SQS QUEUE</span><h2>Send a message</h2><p>Send a JSON or plain text payload to ${escapeHtml(queue.name)}.</p></div><button class="icon-button dialog-x" id="close-sqs-send" type="button" aria-label="Close">×</button></div><label for="sqs-message">JSON or text payload</label><textarea id="sqs-message" spellcheck="false" placeholder='{"event":"created","id":123}' required></textarea>${fifo ? '<label for="sqs-message-group">Message group ID</label><input id="sqs-message-group" required placeholder="default"><label for="sqs-deduplication-id">Deduplication ID <span class="hint">optional with content-based deduplication</span></label><input id="sqs-deduplication-id">' : ''}<div class="json-hint" id="sqs-json-hint">Enter JSON or plain text.</div><div class="dialog-actions"><button class="button secondary" id="cancel-sqs-send" type="button">Cancel</button><button class="button primary" type="submit">Send to queue</button></div></form></dialog>`;
    const grid = content.querySelector('#message-grid');
    const search = content.querySelector('#message-search');
    const filter = content.querySelector('#event-filter');
    const emailFilter = content.querySelector('#email-filter');
    const sort = content.querySelector('#message-sort');
    const sendDialog = content.querySelector('#sqs-send-dialog');
    const newMessage = content.querySelector('#sqs-message');
    content.querySelector('#open-sqs-send').onclick = () => {
      sendDialog.showModal();
      newMessage.focus();
    };
    content.querySelector('#close-sqs-send').onclick = () => sendDialog.close();
    content.querySelector('#cancel-sqs-send').onclick = () => sendDialog.close();
    newMessage.oninput = () => {
      try {
        JSON.parse(newMessage.value);
        content.querySelector('#sqs-json-hint').textContent = '✓ Valid JSON';
        content.querySelector('#sqs-json-hint').className = 'json-hint valid';
      } catch {
        content.querySelector('#sqs-json-hint').textContent = 'Plain text';
        content.querySelector('#sqs-json-hint').className = 'json-hint';
      }
    };
    content.querySelector('#sqs-send-form').onsubmit = async (event) => {
      event.preventDefault();
      const button = event.submitter;
      button.disabled = true;
      try {
        const result = await api.sendMessage(queue.url, newMessage.value, {
          ...(fifo ? { messageGroupId: content.querySelector('#sqs-message-group').value } : {}),
          ...(fifo && content.querySelector('#sqs-deduplication-id').value
            ? { deduplicationId: content.querySelector('#sqs-deduplication-id').value }
            : {}),
        });
        setStatus(`Message sent: ${result.messageId}`);
        await loadMessages(container, queue, { background: true });
      } catch (error) {
        setStatus(error.message, 'error');
        button.disabled = false;
      }
    };
    let currentPage = 1;
    const renderMessages = () => {
      const query = search.value.trim().toLocaleLowerCase();
      const visible = messages
        .map((message, originalIndex) => ({ message, originalIndex }))
        .filter(({ message }) => !filter.value || eventTypeOf(message) === filter.value)
        .filter(({ message }) => !emailFilter.value || userEmailOf(message) === emailFilter.value)
        .filter(
          ({ message }) =>
            !query ||
            `${eventTypeOf(message)} ${userEmailOf(message)} ${message.id} ${message.body}`
              .toLocaleLowerCase()
              .includes(query),
        )
        .sort((a, b) =>
          sort.value === 'type'
            ? eventTypeOf(a.message).localeCompare(eventTypeOf(b.message))
            : (timestampOf(a.message) - timestampOf(b.message)) *
              (sort.value === 'oldest' ? 1 : -1),
        );
      const totalPages = Math.max(1, Math.ceil(visible.length / MESSAGE_PAGE_SIZE));
      currentPage = Math.min(currentPage, totalPages);
      const pageStart = (currentPage - 1) * MESSAGE_PAGE_SIZE;
      const pageMessages = visible.slice(pageStart, pageStart + MESSAGE_PAGE_SIZE);
      content.querySelector('#message-results').textContent =
        `${visible.length} of ${messages.length}`;
      grid.innerHTML = visible.length
        ? `${pageMessages.map(({ message, originalIndex }) => messageCard(message, originalIndex)).join('')}
        <nav class="table-pagination message-pagination" aria-label="Message pagination">
          <span>${pageStart + 1}–${Math.min(pageStart + MESSAGE_PAGE_SIZE, visible.length)} of ${visible.length}</span>
          <div><button class="button secondary" id="previous-message-page" ${currentPage === 1 ? 'disabled' : ''} aria-label="Previous message page">‹ Previous</button><span>Page ${currentPage} of ${totalPages}</span><button class="button secondary" id="next-message-page" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Next message page">Next ›</button></div>
        </nav>`
        : `<div class="empty"><b>${messages.length ? 'No messages match' : 'No visible messages'}</b><span>${messages.length ? 'Try changing the search or event type filter.' : 'Send a message or refresh this page.'}</span></div>`;
      grid.querySelector('#previous-message-page')?.addEventListener('click', () => {
        currentPage -= 1;
        renderMessages();
      });
      grid.querySelector('#next-message-page')?.addEventListener('click', () => {
        currentPage += 1;
        renderMessages();
      });
      grid.querySelectorAll('[data-remove]').forEach(
        (button) =>
          (button.onclick = async () => {
            if (!confirm('Permanently delete this message?')) return;
            const message = messages[button.dataset.remove];
            try {
              await api.deleteMessage(
                queue.url,
                message.id,
                message.archived ? null : message.receiptHandle,
              );
              setStatus('Message deleted');
              await loadMessages(container, queue, { background: true });
            } catch (error) {
              setStatus(error.message, 'error');
            }
          }),
      );
    };
    [search, filter, emailFilter, sort].forEach((control) =>
      control.addEventListener(control === search ? 'input' : 'change', () => {
        currentPage = 1;
        renderMessages();
      }),
    );
    renderMessages();
    content.querySelector('#refresh-messages').onclick = () =>
      loadMessages(container, activeQueue, { background: true, notify: true });
    if (notify) setStatus('Messages updated');
  } catch (error) {
    if (background) {
      if (refreshButton?.isConnected) {
        refreshButton.disabled = false;
        refreshButton.removeAttribute('aria-busy');
        refreshButton.textContent = '↻ Refresh';
      }
      setStatus(error.message, 'error');
    } else {
      showError(content, error);
    }
  }
}

export async function renderSqs(container) {
  showLoading(container, 'Listing SQS queues…');
  try {
    const { queues } = await api.queues();
    container.innerHTML = `<div class="page-head"><div><span class="eyebrow">MESSAGING</span><h1>SQS queues</h1><p>Inspect JSON payloads and remove messages during development.</p></div></div><section class="resource-layout"><aside class="resource-list"><label>QUEUES</label>${queues.map((queue, index) => `<button class="resource-option ${index === 0 ? 'active' : ''}" data-queue="${index}"><span>⇥</span><span><b>${escapeHtml(queue.name)}</b><small>${escapeHtml(queue.url)}</small></span></button>`).join('') || '<div class="empty"><span>No queues found</span></div>'}</aside><div id="queue-content"><div class="empty"><b>Select a queue</b></div></div></section>`;
    container.querySelectorAll('[data-queue]').forEach(
      (button) =>
        (button.onclick = () => {
          container
            .querySelectorAll('[data-queue]')
            .forEach((item) => item.classList.toggle('active', item === button));
          loadMessages(container, queues[button.dataset.queue]);
        }),
    );
    if (queues[0]) loadMessages(container, queues[0]);
  } catch (error) {
    showError(container, error);
  }
}
