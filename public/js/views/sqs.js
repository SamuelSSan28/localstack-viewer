import { api } from '../api.js';
import { escapeHtml, setStatus, showError, showLoading } from '../ui.js';

let activeQueue;

const bodyView = (message) => message.json
  ? `<pre class="json-viewer"><code>${escapeHtml(JSON.stringify(message.json, null, 2))}</code></pre>`
  : `<pre class="message-text">${escapeHtml(message.body)}</pre>`;

async function loadMessages(container, queue) {
  activeQueue = queue;
  const content = container.querySelector('#queue-content');
  showLoading(content, `Reading messages from ${queue.name}…`);
  try {
    const { messages } = await api.messages(queue.url);
    content.innerHTML = `<div class="table-toolbar"><div><span class="eyebrow">SQS QUEUE</span><h2>${escapeHtml(queue.name)}</h2><p>${messages.length} visible message(s), without changing visibility.</p></div><button class="button secondary" id="refresh-messages">↻ Refresh</button></div>
      <div class="message-grid">${messages.length ? messages.map((message, index) => `<article class="message-card"><div class="message-meta"><span class="type-badge">${message.json ? 'JSON' : 'TEXT'}</span><code>${escapeHtml(message.id)}</code><button class="danger-link" data-remove="${index}">Delete</button></div>${bodyView(message)}<details><summary>Technical metadata</summary><dl><dt>Message ID</dt><dd>${escapeHtml(message.id)}</dd><dt>MD5</dt><dd>${escapeHtml(message.md5)}</dd></dl></details></article>`).join('') : '<div class="empty"><b>No visible messages</b><span>Send a message or refresh this page.</span></div>'}</div>`;
    content.querySelector('#refresh-messages').onclick = () => loadMessages(container, activeQueue);
    content.querySelectorAll('[data-remove]').forEach((button) => button.onclick = async () => {
      if (!confirm('Permanently delete this message?')) return;
      try { await api.deleteMessage(queue.url, messages[button.dataset.remove].receiptHandle); setStatus('Message deleted'); await loadMessages(container, queue); } catch (error) { setStatus(error.message, 'error'); }
    });
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
