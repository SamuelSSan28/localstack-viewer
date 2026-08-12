import { api } from '../api.js';
import { escapeHtml, setStatus, showError, showLoading } from '../ui.js';

let activeQueue;

export const eventTypeOf = (message) => {
  if (!message.json || Array.isArray(message.json)) return message.json ? 'JSON event' : 'Text message';
  const payload = message.json.Message && typeof message.json.Message === 'string'
    ? (() => { try { return JSON.parse(message.json.Message); } catch { return null; } })()
    : null;
  const source = payload || message.json;
  const eventType = source['detail-type'] || source.eventType || source.event_type || source.type
    || source.Type || source.event || source.Event;
  return typeof eventType === 'string' || typeof eventType === 'number' ? String(eventType) : 'JSON event';
};

const decodedPayloadOf = (message) => {
  if (!message.json || Array.isArray(message.json)) return message.json;
  if (typeof message.json.Message !== 'string') return message.json;
  try { return JSON.parse(message.json.Message); } catch { return message.json; }
};

export const userEmailOf = (message) => {
  const payload = decodedPayloadOf(message);
  if (!payload || typeof payload !== 'object') return '';
  const candidates = [payload, payload.detail, payload.data, payload.user, payload.detail?.user].filter(Boolean);
  for (const candidate of candidates) {
    const email = candidate.userEmail || candidate.user_email || candidate.email;
    if (typeof email === 'string' && email.trim()) return email.trim();
  }
  return '';
};

const timestampOf = (message) => {
  const candidate = message.sentTimestamp || message.json?.time || message.json?.timestamp
    || message.json?.Timestamp || message.json?.createdAt;
  if (!candidate) return 0;
  const milliseconds = /^\d+$/.test(String(candidate)) ? Number(candidate) : Date.parse(candidate);
  return Number.isFinite(milliseconds) ? milliseconds : 0;
};

const formattedTime = (message) => {
  const timestamp = timestampOf(message);
  return timestamp ? new Date(timestamp).toLocaleString() : 'Time unavailable';
};

const bodyView = (message) => message.json
  ? `<pre class="json-viewer"><code>${escapeHtml(JSON.stringify(message.json, null, 2))}</code></pre>`
  : `<pre class="message-text">${escapeHtml(message.body)}</pre>`;

const messageCard = (message, originalIndex) => `<article class="message-card">
  <div class="message-meta">
    <span class="event-type-badge" title="Event type">${escapeHtml(eventTypeOf(message))}</span>
    ${userEmailOf(message) ? `<span class="message-user" title="User email">${escapeHtml(userEmailOf(message))}</span>` : ''}
    <time datetime="${timestampOf(message) ? new Date(timestampOf(message)).toISOString() : ''}">${escapeHtml(formattedTime(message))}</time>
    <code title="${escapeHtml(message.id)}">${escapeHtml(message.id)}</code>
    <button class="danger-link" data-remove="${originalIndex}">Delete</button>
  </div>
  ${bodyView(message)}
  <details><summary>Technical metadata</summary><dl><dt>Message ID</dt><dd>${escapeHtml(message.id)}</dd><dt>MD5</dt><dd>${escapeHtml(message.md5)}</dd><dt>Sent</dt><dd>${escapeHtml(formattedTime(message))}</dd></dl></details>
</article>`;

async function loadMessages(container, queue) {
  activeQueue = queue;
  const content = container.querySelector('#queue-content');
  showLoading(content, `Reading messages from ${queue.name}…`);
  try {
    const { messages } = await api.messages(queue.url);
    const eventTypes = [...new Set(messages.map(eventTypeOf))].sort((a, b) => a.localeCompare(b));
    const userEmails = [...new Set(messages.map(userEmailOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    content.innerHTML = `<div class="table-toolbar"><div><span class="eyebrow">SQS QUEUE</span><h2>${escapeHtml(queue.name)}</h2><p>${messages.length} visible message(s), without changing visibility.</p></div><button class="button secondary" id="refresh-messages">↻ Refresh</button></div>
      <div class="message-tools" aria-label="Message filters">
        <label><span>Search messages</span><input id="message-search" type="search" placeholder="Event type, ID or payload…"></label>
        <label><span>Event type</span><span class="select-control"><select id="event-filter"><option value="">All event types</option>${eventTypes.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('')}</select></span></label>
        <label><span>User email</span><span class="select-control"><select id="email-filter"><option value="">All users</option>${userEmails.map((email) => `<option value="${escapeHtml(email)}">${escapeHtml(email)}</option>`).join('')}</select></span></label>
        <label><span>Sort by</span><span class="select-control"><select id="message-sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="type">Event type A–Z</option></select></span></label>
        <span class="message-results" id="message-results" aria-live="polite"></span>
      </div>
      <div class="message-grid" id="message-grid"></div>`;
    const grid = content.querySelector('#message-grid');
    const search = content.querySelector('#message-search');
    const filter = content.querySelector('#event-filter');
    const emailFilter = content.querySelector('#email-filter');
    const sort = content.querySelector('#message-sort');
    const renderMessages = () => {
      const query = search.value.trim().toLocaleLowerCase();
      const visible = messages.map((message, originalIndex) => ({ message, originalIndex }))
        .filter(({ message }) => !filter.value || eventTypeOf(message) === filter.value)
        .filter(({ message }) => !emailFilter.value || userEmailOf(message) === emailFilter.value)
        .filter(({ message }) => !query || `${eventTypeOf(message)} ${userEmailOf(message)} ${message.id} ${message.body}`.toLocaleLowerCase().includes(query))
        .sort((a, b) => sort.value === 'type'
          ? eventTypeOf(a.message).localeCompare(eventTypeOf(b.message))
          : (timestampOf(a.message) - timestampOf(b.message)) * (sort.value === 'oldest' ? 1 : -1));
      content.querySelector('#message-results').textContent = `${visible.length} of ${messages.length}`;
      grid.innerHTML = visible.length ? visible.map(({ message, originalIndex }) => messageCard(message, originalIndex)).join('')
        : `<div class="empty"><b>${messages.length ? 'No messages match' : 'No visible messages'}</b><span>${messages.length ? 'Try changing the search or event type filter.' : 'Send a message or refresh this page.'}</span></div>`;
      grid.querySelectorAll('[data-remove]').forEach((button) => button.onclick = async () => {
        if (!confirm('Permanently delete this message?')) return;
        const message = messages[button.dataset.remove];
        try { await api.deleteMessage(queue.url, message.id, message.archived ? null : message.receiptHandle); setStatus('Message deleted'); await loadMessages(container, queue); } catch (error) { setStatus(error.message, 'error'); }
      });
    };
    [search, filter, emailFilter, sort].forEach((control) => control.addEventListener(control === search ? 'input' : 'change', renderMessages));
    renderMessages();
    content.querySelector('#refresh-messages').onclick = () => loadMessages(container, activeQueue);
  } catch (error) { showError(content, error); }
}

export async function renderSqs(container) {
  showLoading(container, 'Listing SQS queues…');
  try {
    const { queues } = await api.queues();
    container.innerHTML = `<div class="page-head"><div><span class="eyebrow">MESSAGING</span><h1>SQS queues</h1><p>Inspect JSON payloads and remove messages during development.</p></div></div><section class="resource-layout"><aside class="resource-list"><label>QUEUES</label>${queues.map((queue, index) => `<button class="resource-option ${index === 0 ? 'active' : ''}" data-queue="${index}"><span>⇥</span><span><b>${escapeHtml(queue.name)}</b><small>${escapeHtml(queue.url)}</small></span></button>`).join('') || '<div class="empty"><span>No queues found</span></div>'}</aside><div id="queue-content"><div class="empty"><b>Select a queue</b></div></div></section>`;
    container.querySelectorAll('[data-queue]').forEach((button) => button.onclick = () => {
      container.querySelectorAll('[data-queue]').forEach((item) => item.classList.toggle('active', item === button));
      loadMessages(container, queues[button.dataset.queue]);
    });
    if (queues[0]) loadMessages(container, queues[0]);
  } catch (error) { showError(container, error); }
}
