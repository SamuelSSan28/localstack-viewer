import { api } from '../api.js';
import { escapeHtml, setStatus, showError, showLoading } from '../ui.js';

async function loadTopic(container, topic) {
  const content = container.querySelector('#topic-content');
  showLoading(content, `Consultando ${topic.name}…`);
  try {
    const { subscriptions } = await api.topic(topic.arn);
    content.innerHTML = `<div class="table-toolbar"><div><span class="eyebrow">TÓPICO SNS</span><h2>${escapeHtml(topic.name)}</h2><p class="truncate" title="${escapeHtml(topic.arn)}">${escapeHtml(topic.arn)}</p></div></div>
      <div class="info-callout"><b>Como visualizar mensagens do SNS?</b><p>O SNS entrega mensagens imediatamente e não mantém histórico. Para inspecionar payloads, associe uma fila SQS ao tópico e use o visualizador de filas. Abaixo você pode publicar uma mensagem de teste.</p></div>
      <section class="topic-columns"><div><h3>Assinaturas <span class="count-pill">${subscriptions.length}</span></h3><div class="subscription-list">${subscriptions.map((subscription) => `<article><span class="protocol">${escapeHtml(subscription.protocol)}</span><div><b>${escapeHtml(subscription.endpoint)}</b><small>${escapeHtml(subscription.arn)}</small></div></article>`).join('') || '<div class="empty"><span>Nenhuma assinatura configurada</span></div>'}</div></div>
      <form class="publish-panel" id="publish-form"><h3>Publicar mensagem de teste</h3><label>Assunto <span>opcional</span><input id="sns-subject" maxlength="100"></label><label>Payload JSON ou texto<textarea id="sns-message" spellcheck="false" placeholder='{"event":"created","id":123}' required></textarea></label><div class="json-hint" id="json-hint">Digite JSON ou texto simples.</div><button class="button primary">Publicar no tópico</button></form></section>`;
    const message = content.querySelector('#sns-message');
    message.oninput = () => {
      try { JSON.parse(message.value); content.querySelector('#json-hint').textContent = '✓ JSON válido'; content.querySelector('#json-hint').className = 'json-hint valid'; }
      catch { content.querySelector('#json-hint').textContent = 'Texto simples'; content.querySelector('#json-hint').className = 'json-hint'; }
    };
    content.querySelector('#publish-form').onsubmit = async (event) => {
      event.preventDefault();
      try {
        const result = await api.publish(topic.arn, message.value, content.querySelector('#sns-subject').value);
        setStatus(`Mensagem publicada: ${result.messageId}`);
        event.target.reset();
      } catch (error) { setStatus(error.message, 'error'); }
    };
  } catch (error) { showError(content, error); }
}

export async function renderSns(container) {
  showLoading(container, 'Listando tópicos SNS…');
  try {
    const { topics } = await api.topics();
    container.innerHTML = `<div class="page-head"><div><span class="eyebrow">PUB/SUB</span><h1>Tópicos SNS</h1><p>Confira assinaturas e publique payloads de teste.</p></div></div><section class="resource-layout"><aside class="resource-list"><label>TÓPICOS</label>${topics.map((topic, index) => `<button class="resource-option ${index === 0 ? 'active' : ''}" data-topic="${index}"><span>⌁</span><span><b>${escapeHtml(topic.name)}</b><small>${escapeHtml(topic.arn)}</small></span></button>`).join('') || '<div class="empty"><span>Nenhum tópico encontrado</span></div>'}</aside><div id="topic-content"><div class="empty"><b>Selecione um tópico</b></div></div></section>`;
    container.querySelectorAll('[data-topic]').forEach((button) => button.onclick = () => {
      container.querySelectorAll('[data-topic]').forEach((item) => item.classList.toggle('active', item === button));
      loadTopic(container, topics[button.dataset.topic]);
    });
    if (topics[0]) loadTopic(container, topics[0]);
  } catch (error) { showError(container, error); }
}
