export const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

export function setStatus(message, type = '') {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.className = `toast show ${type}`;
  clearTimeout(setStatus.timer);
  setStatus.timer = setTimeout(() => element.className = 'toast', 3000);
}

export function showLoading(container, message = 'Loading…') {
  container.innerHTML = `<div class="state"><span class="spinner"></span>${escapeHtml(message)}</div>`;
}

export function showError(container, error) {
  container.innerHTML = `<div class="state error-state"><b>Unable to load</b><span>${escapeHtml(error.message)}</span></div>`;
}
