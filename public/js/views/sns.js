import { api } from '../api.js';
import { escapeHtml, setStatus, showError, showLoading } from '../ui.js';

async function loadTopic(container, topic) {
  const content = container.querySelector('#topic-content');
  showLoading(content, `Loading ${topic.name}…`);
  try {
    const { subscriptions } = await api.topic(topic.arn);
    content.innerHTML = `<div class="table-toolbar"><div><span class="eyebrow">SNS TOPIC</span><h2>${escapeHtml(topic.name)}</h2><p class="truncate" title="${escapeHtml(topic.arn)}">${escapeHtml(topic.arn)}</p></div></div>
      <div class="info-callout"><b>How can I inspect SNS messages?</b><p>SNS delivers messages immediately and does not retain history. Subscribe an SQS queue to inspect delivered payloads in the queue viewer. You can publish a test message below.</p></div>
      <section class="topic-columns"><div><h3>Subscriptions <span class="count-pill">${subscriptions.length}</span></h3><div class="subscription-list">${subscriptions.map((subscription) => `<article><span class="protocol">${escapeHtml(subscription.protocol)}</span><div><b>${escapeHtml(subscription.endpoint)}</b><small>${escapeHtml(subscription.arn)}</small></div></article>`).join('') || '<div class="empty"><span>No subscriptions configured</span></div>'}</div></div>
      <form class="publish-panel" id="publish-form"><h3>Publish test message</h3><label>Subject <span>optional</span><input id="sns-subject" maxlength="100"></label><label>JSON or text payload<textarea id="sns-message" spellcheck="false" placeholder='{"event":"created","id":123}' required></textarea></label><div class="json-hint" id="json-hint">Enter JSON or plain text.</div><button class="button primary">Publish to topic</button></form></section>`;
    const message = content.querySelector('#sns-message');
    message.oninput = () => {
      try {
        JSON.parse(message.value);
        content.querySelector('#json-hint').textContent = '✓ Valid JSON';
        content.querySelector('#json-hint').className = 'json-hint valid';
      } catch {
        content.querySelector('#json-hint').textContent = 'Plain text';
        content.querySelector('#json-hint').className = 'json-hint';
      }
    };
    content.querySelector('#publish-form').onsubmit = async (event) => {
      event.preventDefault();
      try {
        const result = await api.publish(
          topic.arn,
          message.value,
          content.querySelector('#sns-subject').value,
        );
        setStatus(`Message published: ${result.messageId}`);
        event.target.reset();
      } catch (error) {
        setStatus(error.message, 'error');
      }
    };
  } catch (error) {
    showError(content, error);
  }
}

export async function renderSns(container) {
  showLoading(container, 'Listing SNS topics…');
  try {
    const { topics } = await api.topics();
    container.innerHTML = `<div class="page-head"><div><span class="eyebrow">PUB/SUB</span><h1>SNS topics</h1><p>Inspect subscriptions and publish test payloads.</p></div></div><section class="resource-layout"><aside class="resource-list"><label>TOPICS</label>${topics.map((topic, index) => `<button class="resource-option ${index === 0 ? 'active' : ''}" data-topic="${index}"><span>⌁</span><span><b>${escapeHtml(topic.name)}</b><small>${escapeHtml(topic.arn)}</small></span></button>`).join('') || '<div class="empty"><span>No topics found</span></div>'}</aside><div id="topic-content"><div class="empty"><b>Select a topic</b></div></div></section>`;
    container.querySelectorAll('[data-topic]').forEach(
      (button) =>
        (button.onclick = () => {
          container
            .querySelectorAll('[data-topic]')
            .forEach((item) => item.classList.toggle('active', item === button));
          loadTopic(container, topics[button.dataset.topic]);
        }),
    );
    if (topics[0]) loadTopic(container, topics[0]);
  } catch (error) {
    showError(container, error);
  }
}
