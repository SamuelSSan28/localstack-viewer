export const escapeHtml = (value = '') =>
  String(value).replace(
    /[&<>'"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char],
  );

export function setStatus(message, type = '') {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.className = `toast show ${type}`;
  clearTimeout(setStatus.timer);
  setStatus.timer = setTimeout(() => (element.className = 'toast'), 3000);
}

export function showLoading(container, message = 'Loading…') {
  container.innerHTML = `<div class="state"><span class="spinner"></span>${escapeHtml(message)}</div>`;
}

const serviceLabels = {
  events: 'EventBridge',
  eventbridge: 'EventBridge',
  dynamodb: 'DynamoDB',
  s3: 'S3',
  simpleemailservice: 'SES',
  ses: 'SES',
  simplenotificationservice: 'SNS',
  sns: 'SNS',
  simplequeueservice: 'SQS',
  sqs: 'SQS',
};

function serviceLabel(service) {
  const key = service.toLowerCase().replace(/[^a-z0-9]/g, '');
  return serviceLabels[key] || service;
}

export function errorPresentation(error) {
  const detail = error?.message || 'An unexpected error occurred.';
  const disabledService = detail.match(/Service ['"]([^'"]+)['"] is not enabled/i)?.[1];
  if (disabledService) {
    const service = serviceLabel(disabledService);
    return {
      eyebrow: 'SERVICE UNAVAILABLE',
      title: `${service} is not enabled`,
      message: `LocalStack is running, but the ${service} service is disabled. Enable it and restart LocalStack to use this page.`,
      hint: `Add ${disabledService} to your SERVICES configuration.`,
      detail,
    };
  }
  if (/fetch|ECONNREFUSED|LocalStack HTTP 5\d\d/i.test(detail)) {
    return {
      eyebrow: 'CONNECTION ISSUE',
      title: 'LocalStack is unavailable',
      message: 'We could not reach this service. Check that LocalStack is running and try again.',
      detail,
    };
  }
  return {
    eyebrow: 'SOMETHING WENT WRONG',
    title: 'Unable to load this page',
    message: 'The request could not be completed. Try again or review the technical details below.',
    detail,
  };
}

export function showError(container, error, retry) {
  const state = errorPresentation(error);
  // Loading failures use one application-level surface, even when they originate
  // from a nested resource panel. This keeps every service failure consistent.
  const surface = document.querySelector('#view') || container;
  surface.innerHTML = `<div class="state error-state" role="alert">
    <div class="error-icon" aria-hidden="true">!</div>
    <span class="eyebrow">${escapeHtml(state.eyebrow)}</span>
    <h2>${escapeHtml(state.title)}</h2>
    <p>${escapeHtml(state.message)}</p>
    ${state.hint ? `<div class="error-hint"><span aria-hidden="true">⚙</span><code>${escapeHtml(state.hint)}</code></div>` : ''}
    <button type="button" class="button primary error-retry">↻ Try again</button>
    <details class="error-details"><summary>Technical details</summary><code>${escapeHtml(state.detail)}</code></details>
  </div>`;
  surface.querySelector('.error-retry').onclick =
    retry || (() => document.querySelector('.nav-item.active')?.click());
}

function enhanceSelect(select) {
  if (select.dataset.enhancedSelect !== undefined || select.multiple || select.size > 1) return;
  select.dataset.enhancedSelect = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'modern-select';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(select);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'modern-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('div');
  panel.className = 'modern-select-panel';
  panel.hidden = true;
  panel.innerHTML = `<div class="modern-select-search"><span aria-hidden="true">⌕</span><input type="search" autocomplete="off" placeholder="Search options…" aria-label="Search options"></div><div class="modern-select-options" role="listbox"></div>`;
  wrapper.append(trigger, panel);

  const search = panel.querySelector('input');
  const options = panel.querySelector('.modern-select-options');
  const sync = () => {
    const selected = select.selectedOptions[0];
    trigger.textContent = selected?.textContent || 'Select an option';
    trigger.disabled = select.disabled;
    trigger.setAttribute('aria-label', select.getAttribute('aria-label') || trigger.textContent);
  };
  const render = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const matches = [...select.options].filter((option) =>
      option.textContent.toLocaleLowerCase().includes(query),
    );
    options.innerHTML = matches.length
      ? matches
          .map(
            (option) =>
              `<button type="button" role="option" data-value="${escapeHtml(option.value)}" aria-selected="${option.selected}" class="${option.selected ? 'selected' : ''}"><span>${escapeHtml(option.textContent)}</span>${option.selected ? '<b aria-hidden="true">✓</b>' : ''}</button>`,
          )
          .join('')
      : '<div class="modern-select-empty">No options found</div>';
  };
  const close = () => {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    wrapper.classList.remove('open');
  };
  trigger.addEventListener('click', () => {
    const opening = panel.hidden;
    document.querySelectorAll('.modern-select.open').forEach((element) => {
      if (element !== wrapper) element.querySelector('.modern-select-trigger').click();
    });
    if (!opening) return close();
    sync();
    search.value = '';
    render();
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    wrapper.classList.add('open');
    search.focus();
  });
  search.addEventListener('input', render);
  options.addEventListener('click', (event) => {
    const option = event.target.closest('[data-value]');
    if (!option) return;
    select.value = option.dataset.value;
    sync();
    close();
    select.dispatchEvent(new Event('change', { bubbles: true }));
    trigger.focus();
  });
  select.addEventListener('change', sync);
  select.form?.addEventListener('reset', () => setTimeout(sync));
  sync();
}

export function initializeSelects(root = document) {
  root.querySelectorAll('select').forEach(enhanceSelect);
  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.modern-select')) return;
    document.querySelectorAll('.modern-select.open').forEach((element) => {
      element.querySelector('.modern-select-trigger').click();
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.modern-select.open').forEach((element) => {
      element.querySelector('.modern-select-trigger').click();
    });
  });
  const observer = new MutationObserver((records) => {
    records.forEach(({ addedNodes }) =>
      addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches('select')) enhanceSelect(node);
        node.querySelectorAll('select').forEach(enhanceSelect);
      }),
    );
  });
  observer.observe(root === document ? document.body : root, { childList: true, subtree: true });
}
