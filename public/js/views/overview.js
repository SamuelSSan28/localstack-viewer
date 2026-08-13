import { api } from '../api.js';
import { escapeHtml, showError, showLoading } from '../ui.js';

const icons = { s3: '▱', sqs: '⇥', dynamodb: '▦', lambda: 'ϟ', sns: '⌁', ses: '✉' };

export async function renderOverview(container) {
  showLoading(container, 'Checking services…');
  try {
    const data = await api.catalog();
    const total = data.services.reduce((sum, service) => sum + service.count, 0);
    const online = data.services.filter((service) => service.status === 'available').length;
    container.innerHTML = `<div class="page-head"><div><span class="eyebrow">LOCAL ENVIRONMENT</span><h1>Overview</h1><p>Health and resources available in LocalStack.</p></div><button class="button secondary" id="reload-overview">↻ Refresh</button></div>
      <section class="hero"><div><span class="status-dot ${online ? '' : 'offline'}"></span><b>${online ? 'LocalStack connected' : 'LocalStack unavailable'}</b><p>${escapeHtml(data.endpoint)}</p></div><div><small>REGION</small><strong>${escapeHtml(data.region)}</strong></div><div><small>RESOURCES</small><strong>${total}</strong></div><div><small>ONLINE SERVICES</small><strong>${online}/${data.services.length}</strong></div></section>
      <div class="section-title"><h2>Services</h2><p>Select a service from the menu to inspect and manage its data.</p></div>
      <section class="cards">${data.services.map((service) => `<article class="card"><div class="card-row"><span class="service-icon">${icons[service.id]}</span><span class="badge ${service.status !== 'available' ? 'off' : ''}">${service.status === 'available' ? 'ONLINE' : 'OFFLINE'}</span></div><h3>${escapeHtml(service.label)}</h3><p><b>${service.count}</b> resource${service.count === 1 ? '' : 's'}</p>${service.error ? `<small title="${escapeHtml(service.error)}">Service unavailable</small>` : ''}</article>`).join('')}</section>`;
    document.querySelector('#reload-overview').onclick = () => renderOverview(container);
  } catch (error) {
    showError(container, error);
  }
}
