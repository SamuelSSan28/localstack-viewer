import { api } from '../api.js';
import { escapeHtml, showError, showLoading } from '../ui.js';

const icons = { s3: '▱', sqs: '⇥', dynamodb: '▦', lambda: 'ϟ', sns: '⌁', ses: '✉' };

export async function renderOverview(container) {
  showLoading(container, 'Consultando os serviços…');
  try {
    const data = await api.catalog();
    const total = data.services.reduce((sum, service) => sum + service.count, 0);
    const online = data.services.filter((service) => service.status === 'available').length;
    container.innerHTML = `<div class="page-head"><div><span class="eyebrow">AMBIENTE LOCAL</span><h1>Visão geral</h1><p>Saúde e recursos disponíveis no LocalStack.</p></div><button class="button secondary" id="reload-overview">↻ Atualizar</button></div>
      <section class="hero"><div><span class="status-dot ${online ? '' : 'offline'}"></span><b>${online ? 'LocalStack conectado' : 'LocalStack indisponível'}</b><p>${escapeHtml(data.endpoint)}</p></div><div><small>REGIÃO</small><strong>${escapeHtml(data.region)}</strong></div><div><small>RECURSOS</small><strong>${total}</strong></div><div><small>SERVIÇOS ONLINE</small><strong>${online}/${data.services.length}</strong></div></section>
      <div class="section-title"><h2>Serviços</h2><p>Selecione DynamoDB ou E-mails no menu para gerenciar os dados.</p></div>
      <section class="cards">${data.services.map((service) => `<article class="card"><div class="card-row"><span class="service-icon">${icons[service.id]}</span><span class="badge ${service.status !== 'available' ? 'off' : ''}">${service.status === 'available' ? 'ONLINE' : 'OFFLINE'}</span></div><h3>${escapeHtml(service.label)}</h3><p><b>${service.count}</b> recurso${service.count === 1 ? '' : 's'}</p>${service.error ? `<small title="${escapeHtml(service.error)}">Serviço indisponível</small>` : ''}</article>`).join('')}</section>`;
    document.querySelector('#reload-overview').onclick = () => renderOverview(container);
  } catch (error) { showError(container, error); }
}
