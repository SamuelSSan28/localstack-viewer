import { api } from '../api.js';
import { escapeHtml, setStatus, showError, showLoading } from '../ui.js';

const patternView = (rule) => {
  const value = rule.eventPattern || (rule.scheduleExpression ? { schedule: rule.scheduleExpression } : null);
  return value
    ? `<pre class="json-viewer"><code>${escapeHtml(JSON.stringify(value, null, 2))}</code></pre>`
    : '<div class="empty"><span>This rule has no event pattern.</span></div>';
};

const targetCard = (target) => `<article class="eventbridge-target">
  <span class="event-type-badge">${escapeHtml(target.id)}</span>
  <div><b>${escapeHtml(target.arn.split(':').slice(2, 3)[0] || 'AWS target')}</b><code title="${escapeHtml(target.arn)}">${escapeHtml(target.arn)}</code></div>
</article>`;

const ruleCard = (rule) => `<article class="message-card eventbridge-rule">
  <div class="message-meta"><span class="event-type-badge">${escapeHtml(rule.state || 'UNKNOWN')}</span><b>${escapeHtml(rule.name)}</b><span>${rule.targets.length} target(s)</span></div>
  ${rule.description ? `<p>${escapeHtml(rule.description)}</p>` : ''}
  <details><summary>Event pattern</summary>${patternView(rule)}</details>
  <details open><summary>Targets</summary><div class="eventbridge-targets">${rule.targets.map(targetCard).join('') || '<div class="empty"><span>No targets configured</span></div>'}</div></details>
</article>`;

async function loadBus(container, bus) {
  const content = container.querySelector('#eventbridge-content');
  showLoading(content, `Loading rules from ${bus.name}…`);
  try {
    const { rules } = await api.eventBridgeRules(bus.name);
    content.innerHTML = `<div class="table-toolbar"><div><span class="eyebrow">EVENT BUS</span><h2>${escapeHtml(bus.name)}</h2><p class="truncate" title="${escapeHtml(bus.arn)}">${escapeHtml(bus.arn)}</p></div><div class="table-toolbar-actions"><button class="button secondary" id="refresh-eventbridge">↻ Refresh</button><button class="button primary" id="open-eventbridge-send">＋ Send an event</button></div></div>
      <div class="message-tools"><label><span>Search rules</span><input id="eventbridge-search" type="search" placeholder="Rule, target or pattern…"></label><label><span>State</span><span class="select-control"><select id="eventbridge-state"><option value="">All states</option><option value="ENABLED">Enabled</option><option value="DISABLED">Disabled</option></select></span></label><span class="message-results" id="eventbridge-results"></span></div>
      <div class="message-grid" id="eventbridge-rules"></div>
      <dialog class="sqs-send-dialog" id="eventbridge-dialog"><form id="eventbridge-form"><div class="dialog-head"><div><span class="eyebrow">EVENTBRIDGE</span><h2>Send a test event</h2><p>Publish an event to ${escapeHtml(bus.name)} and exercise matching rules.</p></div><button class="icon-button dialog-x" id="close-eventbridge" type="button" aria-label="Close">×</button></div><label>Source<input id="event-source" required placeholder="com.example.app" value="com.localstack.viewer"></label><label>Detail type<input id="event-detail-type" required placeholder="Order created"></label><label>Detail (JSON object)<textarea id="event-detail" spellcheck="false" required placeholder='{"orderId":"123"}'>{}</textarea></label><div class="json-hint valid" id="event-json-hint">✓ Valid JSON object</div><div class="dialog-actions"><button class="button secondary" id="cancel-eventbridge" type="button">Cancel</button><button class="button primary" type="submit">Send event</button></div></form></dialog>`;
    const grid = content.querySelector('#eventbridge-rules');
    const search = content.querySelector('#eventbridge-search');
    const state = content.querySelector('#eventbridge-state');
    const render = () => {
      const query = search.value.trim().toLowerCase();
      const visible = rules.filter((rule) => (!state.value || rule.state === state.value) && (!query || JSON.stringify(rule).toLowerCase().includes(query)));
      content.querySelector('#eventbridge-results').textContent = `${visible.length} of ${rules.length}`;
      grid.innerHTML = visible.map(ruleCard).join('') || `<div class="empty"><b>${rules.length ? 'No rules match' : 'No rules configured'}</b><span>${rules.length ? 'Try changing the filters.' : 'Create a rule in your application or with the AWS CLI.'}</span></div>`;
    };
    search.oninput = render;
    state.onchange = render;
    render();

    const dialog = content.querySelector('#eventbridge-dialog');
    content.querySelector('#open-eventbridge-send').onclick = () => dialog.showModal();
    content.querySelector('#close-eventbridge').onclick = () => dialog.close();
    content.querySelector('#cancel-eventbridge').onclick = () => dialog.close();
    content.querySelector('#refresh-eventbridge').onclick = () => loadBus(container, bus);
    const detail = content.querySelector('#event-detail');
    detail.oninput = () => {
      const hint = content.querySelector('#event-json-hint');
      try {
        const parsed = JSON.parse(detail.value);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        hint.textContent = '✓ Valid JSON object';
        hint.className = 'json-hint valid';
      } catch {
        hint.textContent = 'Detail must be a valid JSON object';
        hint.className = 'json-hint invalid';
      }
    };
    content.querySelector('#eventbridge-form').onsubmit = async (event) => {
      event.preventDefault();
      try {
        const detailValue = JSON.parse(detail.value);
        if (!detailValue || typeof detailValue !== 'object' || Array.isArray(detailValue)) throw new Error('Detail must be a JSON object');
        const result = await api.putEvent(bus.name, { source: content.querySelector('#event-source').value, detailType: content.querySelector('#event-detail-type').value, detail: detailValue });
        setStatus(`Event sent: ${result.eventId}`);
        dialog.close();
      } catch (error) {
        setStatus(error.message || 'Detail must be valid JSON', 'error');
      }
    };
  } catch (error) {
    showError(content, error);
  }
}

export async function renderEventBridge(container) {
  showLoading(container, 'Listing EventBridge buses…');
  try {
    const { buses } = await api.eventBuses();
    container.innerHTML = `<div class="page-head"><div><span class="eyebrow">EVENT ROUTING</span><h1>EventBridge</h1><p>Inspect event rules and targets, then publish test events.</p></div></div><section class="resource-layout"><aside class="resource-list"><label>EVENT BUSES</label>${buses.map((bus, index) => `<button class="resource-option ${index === 0 ? 'active' : ''}" data-bus="${index}"><span>⚡</span><span><b>${escapeHtml(bus.name)}</b><small>${escapeHtml(bus.arn)}</small></span></button>`).join('') || '<div class="empty"><span>No event buses found</span></div>'}</aside><div id="eventbridge-content"><div class="empty"><b>Select an event bus</b></div></div></section>`;
    container.querySelectorAll('[data-bus]').forEach((button) => button.onclick = () => {
      container.querySelectorAll('[data-bus]').forEach((item) => item.classList.toggle('active', item === button));
      loadBus(container, buses[button.dataset.bus]);
    });
    if (buses[0]) loadBus(container, buses[0]);
  } catch (error) {
    showError(container, error);
  }
}
