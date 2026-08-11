import { api } from '../api.js';
import { escapeHtml, showError, showLoading } from '../ui.js';

export async function renderEmails(container) {
  showLoading(container, 'Abrindo a caixa de entrada…');
  try {
    const { emails } = await api.emails();
    container.innerHTML = `<div class="page-head"><div><span class="eyebrow">LOCALSTACK SES</span><h1>Caixa de entrada</h1><p>Inspecione os e-mails enviados pelo seu ambiente local.</p></div><button class="button secondary" id="reload-emails">↻ Atualizar</button></div>
      <section class="mail-layout"><div class="mail-list">${emails.length ? emails.map((email, index) => `<button class="mail-item ${index === 0 ? 'active' : ''}" data-email="${index}"><span class="avatar">${escapeHtml(email.from).charAt(0).toUpperCase()}</span><span><b>${escapeHtml(email.subject)}</b><small>${escapeHtml(email.from)}</small><small>Para: ${escapeHtml([].concat(email.to).join(', '))}</small></span></button>`).join('') : '<div class="empty"><b>Nenhum e-mail recebido</b><span>As mensagens enviadas pelo SES aparecerão aqui.</span></div>'}</div><article class="mail-reader" id="mail-reader"></article></section>`;
    const open = (index) => {
      const email = emails[index];
      document.querySelectorAll('.mail-item').forEach((item) => item.classList.toggle('active', Number(item.dataset.email) === index));
      document.querySelector('#mail-reader').innerHTML = email ? `<div class="reader-head"><span class="eyebrow">MENSAGEM</span><h2>${escapeHtml(email.subject)}</h2><p><b>De:</b> ${escapeHtml(email.from)}</p><p><b>Para:</b> ${escapeHtml([].concat(email.to).join(', '))}</p></div><pre>${escapeHtml(email.body || JSON.stringify(email.raw, null, 2))}</pre>` : '<div class="empty"><b>Selecione uma mensagem</b></div>';
    };
    document.querySelectorAll('.mail-item').forEach((item) => item.onclick = () => open(Number(item.dataset.email)));
    document.querySelector('#reload-emails').onclick = () => renderEmails(container);
    open(0);
  } catch (error) { showError(container, error); }
}
