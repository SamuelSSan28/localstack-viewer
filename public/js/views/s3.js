import { api } from '../api.js';
import { escapeHtml, setStatus, showError, showLoading } from '../ui.js';

let selectedBucket = '';
const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${['B', 'KB', 'MB', 'GB', 'TB'][unit]}`;
};
const fileContent = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

async function showDetails(container, bucket, key) {
  const dialog = container.querySelector('#s3-details');
  const body = dialog.querySelector('.s3-detail-body');
  showLoading(body, 'Loading object details…');
  dialog.showModal();
  try {
    const { object } = await api.object(bucket, key);
    body.innerHTML = `<div class="s3-detail-grid"><span>Key</span><code>${escapeHtml(object.key)}</code><span>Size</span><b>${formatBytes(object.size)}</b><span>Content type</span><code>${escapeHtml(object.contentType)}</code><span>ETag</span><code>${escapeHtml(object.etag || '—')}</code><span>Last modified</span><span>${escapeHtml(object.lastModified || '—')}</span></div>
      <label>Custom metadata (JSON)</label><textarea id="s3-metadata">${escapeHtml(JSON.stringify(object.metadata, null, 2))}</textarea>
      ${object.preview === null ? '<div class="info-callout"><b>Preview unavailable</b><p>This binary file or file larger than 1 MB can still be downloaded.</p></div>' : `<label>Preview</label><pre class="s3-preview">${escapeHtml(object.preview)}</pre>`}`;
    dialog.querySelector('#detail-content-type').value = object.contentType;
    dialog.querySelector('#download-object').href = api.objectDownloadUrl(bucket, key);
    dialog.querySelector('#save-object').onclick = async () => {
      try {
        const metadata = JSON.parse(body.querySelector('#s3-metadata').value || '{}');
        await api.updateObject(bucket, key, {
          contentType: dialog.querySelector('#detail-content-type').value,
          metadata,
        });
        setStatus('Object metadata updated');
        dialog.close();
        await loadObjects(container, bucket);
      } catch (error) {
        setStatus(
          error instanceof SyntaxError ? 'Metadata must be valid JSON' : error.message,
          'error',
        );
      }
    };
  } catch (error) {
    showError(body, error);
  }
}

async function loadObjects(container, bucket) {
  selectedBucket = bucket;
  const content = container.querySelector('#s3-content');
  showLoading(content, `Listing objects in ${bucket}…`);
  try {
    const { objects } = await api.objects(bucket);
    content.innerHTML = `<div class="table-toolbar"><div><span class="eyebrow">S3 BUCKET</span><h2>${escapeHtml(bucket)}</h2><p>${objects.length} object(s)</p></div><div class="s3-actions"><button class="button danger" id="delete-bucket">Delete bucket</button><button class="button secondary" id="refresh-objects">↻ Refresh</button><button class="button" id="upload-object">Upload files</button></div></div>
      <div class="message-tools s3-tools"><label><span>Search objects</span><input id="object-search" type="search" placeholder="File name or path…"></label><span class="message-results" id="object-results"></span></div>
      <div class="table-scroll"><table><thead><tr><th>Object key</th><th>Type</th><th>Size</th><th>Last modified</th><th class="actions actions-head">Actions</th></tr></thead><tbody id="object-rows"></tbody></table></div>`;
    const rows = content.querySelector('#object-rows');
    const search = content.querySelector('#object-search');
    const render = () => {
      const query = search.value.trim().toLowerCase();
      const visible = objects.filter((object) => object.key.toLowerCase().includes(query));
      content.querySelector('#object-results').textContent =
        `${visible.length} of ${objects.length}`;
      rows.innerHTML = visible.length
        ? visible
            .map(
              (object) =>
                `<tr data-key="${escapeHtml(object.key)}"><td><span class="s3-object-icon">▧</span><code>${escapeHtml(object.key)}</code></td><td><span class="type-badge">${escapeHtml(object.key.includes('.') ? object.key.split('.').pop() : 'file')}</span></td><td>${formatBytes(object.size)}</td><td>${escapeHtml(object.lastModified ? new Date(object.lastModified).toLocaleString() : '—')}</td><td class="actions"><button class="row-action" data-details="${escapeHtml(object.key)}" title="View details">◉</button><button class="row-action delete-action" data-delete="${escapeHtml(object.key)}" title="Delete">×</button></td></tr>`,
            )
            .join('')
        : '<tr><td colspan="5"><div class="filter-empty">No objects found</div></td></tr>';
      rows.querySelectorAll('[data-details]').forEach(
        (button) =>
          (button.onclick = (event) => {
            event.stopPropagation();
            showDetails(container, bucket, button.dataset.details);
          }),
      );
      rows.querySelectorAll('[data-delete]').forEach(
        (button) =>
          (button.onclick = async (event) => {
            event.stopPropagation();
            if (!confirm(`Delete ${button.dataset.delete}?`)) return;
            try {
              await api.deleteObject(bucket, button.dataset.delete);
              setStatus('Object deleted');
              await loadObjects(container, bucket);
            } catch (error) {
              setStatus(error.message, 'error');
            }
          }),
      );
      rows
        .querySelectorAll('tr[data-key]')
        .forEach((row) => (row.onclick = () => showDetails(container, bucket, row.dataset.key)));
    };
    search.oninput = render;
    render();
    content.querySelector('#refresh-objects').onclick = () => loadObjects(container, bucket);
    content.querySelector('#delete-bucket').onclick = async () => {
      if (objects.length)
        return setStatus('Delete all objects before deleting this bucket', 'error');
      if (!confirm(`Delete empty bucket ${bucket}?`)) return;
      try {
        await api.deleteBucket(bucket);
        setStatus('Bucket deleted');
        await renderS3(container);
      } catch (error) {
        setStatus(error.message, 'error');
      }
    };
    content.querySelector('#upload-object').onclick = () => {
      container.querySelector('#upload-form').reset();
      container.querySelector('#upload-dialog').showModal();
    };
  } catch (error) {
    showError(content, error);
  }
}

export async function renderS3(container) {
  showLoading(container, 'Listing S3 buckets…');
  try {
    const { buckets } = await api.buckets();
    const regions = [...new Set(buckets.map((bucket) => bucket.region || 'unknown'))].sort();
    container.innerHTML = `<div class="page-head"><div><span class="eyebrow">STORAGE</span><h1>S3 buckets</h1><p>Browse files, inspect metadata and upload development assets.</p></div><button class="button" id="new-bucket">New bucket</button></div>
      <section class="resource-layout"><aside class="resource-list s3-bucket-list"><label>BUCKETS</label><div class="s3-bucket-filters"><input id="bucket-search" type="search" aria-label="Search buckets" placeholder="Search buckets…"><select id="bucket-region" aria-label="Filter buckets by region"><option value="">All regions</option>${regions.map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`).join('')}</select><small id="bucket-results"></small></div><div id="bucket-options"></div></aside><div id="s3-content"><div class="empty"><b>Select a bucket</b></div></div></section>
      <dialog id="upload-dialog"><form method="dialog" id="upload-form"><div class="dialog-head"><div><span class="eyebrow">S3 UPLOAD</span><h2>Upload files</h2></div><button class="icon-button dialog-x" value="cancel">×</button></div><label>Files</label><input id="upload-files" type="file" multiple required><label>Key prefix <span class="hint">optional</span></label><input id="upload-prefix" placeholder="images/2026"><div class="dialog-actions"><button class="button secondary" value="cancel">Cancel</button><button class="button" id="submit-upload" value="default">Upload</button></div></form></dialog>
      <dialog id="s3-details"><div class="dialog-head"><div><span class="eyebrow">OBJECT</span><h2>Object details</h2></div><button class="icon-button dialog-x" onclick="this.closest('dialog').close()">×</button></div><label>Content type</label><input id="detail-content-type"><div class="s3-detail-body"></div><div class="dialog-actions"><a class="button secondary" id="download-object">Download</a><button class="button" id="save-object">Save metadata</button></div></dialog>`;
    const bucketOptions = container.querySelector('#bucket-options');
    const bucketSearch = container.querySelector('#bucket-search');
    const bucketRegion = container.querySelector('#bucket-region');
    let activeContentBucket = '';
    const selectBucket = (button) => {
      container
        .querySelectorAll('[data-bucket]')
        .forEach((item) => item.classList.toggle('active', item === button));
      activeContentBucket = button.dataset.bucket;
      loadObjects(container, button.dataset.bucket);
    };
    const renderBuckets = () => {
      const query = bucketSearch.value.trim().toLowerCase();
      const region = bucketRegion.value;
      const visible = buckets.filter(
        (bucket) =>
          bucket.name.toLowerCase().includes(query) && (!region || bucket.region === region),
      );
      container.querySelector('#bucket-results').textContent =
        `${visible.length} of ${buckets.length} bucket(s)`;
      bucketOptions.innerHTML =
        visible
          .map(
            (bucket) =>
              `<button class="resource-option ${bucket.name === selectedBucket ? 'active' : ''}" data-bucket="${escapeHtml(bucket.name)}"><span>▱</span><span><b>${escapeHtml(bucket.name)}</b><small><span class="s3-region">${escapeHtml(bucket.region || 'unknown')}</span>${escapeHtml(bucket.createdAt ? new Date(bucket.createdAt).toLocaleDateString() : 'Creation date unavailable')}</small></span></button>`,
          )
          .join('') ||
        `<div class="list-empty"><b>No buckets found</b><span>${buckets.length ? 'Try another name or region.' : 'Create one to upload files.'}</span></div>`;
      bucketOptions.querySelectorAll('[data-bucket]').forEach((button) => {
        button.onclick = () => selectBucket(button);
      });
      if (visible.length) {
        const target = visible.some((bucket) => bucket.name === selectedBucket)
          ? bucketOptions.querySelector(`[data-bucket="${CSS.escape(selectedBucket)}"]`)
          : bucketOptions.querySelector('[data-bucket]');
        if (target.dataset.bucket !== activeContentBucket) selectBucket(target);
      } else {
        activeContentBucket = '';
        container.querySelector('#s3-content').innerHTML =
          '<div class="empty"><b>No bucket selected</b><span>Change the filters to browse a bucket.</span></div>';
      }
    };
    bucketSearch.oninput = renderBuckets;
    bucketRegion.onchange = renderBuckets;
    container.querySelector('#new-bucket').onclick = async () => {
      const name = prompt('New bucket name');
      if (!name) return;
      try {
        await api.createBucket(name.trim());
        setStatus('Bucket created');
        await renderS3(container);
      } catch (error) {
        setStatus(error.message, 'error');
      }
    };
    container.querySelector('#upload-form').onsubmit = async (event) => {
      event.preventDefault();
      const files = [...container.querySelector('#upload-files').files];
      if (!files.length) return;
      const prefix = container
        .querySelector('#upload-prefix')
        .value.trim()
        .replace(/^\/+|\/+$/g, '');
      try {
        for (const file of files)
          await api.uploadObject(selectedBucket, {
            key: `${prefix ? `${prefix}/` : ''}${file.name}`,
            contentType: file.type,
            content: await fileContent(file),
          });
        setStatus(`${files.length} file(s) uploaded`);
        container.querySelector('#upload-dialog').close();
        await loadObjects(container, selectedBucket);
      } catch (error) {
        setStatus(error.message, 'error');
      }
    };
    selectedBucket = buckets.some((bucket) => bucket.name === selectedBucket) ? selectedBucket : '';
    renderBuckets();
  } catch (error) {
    showError(container, error);
  }
}

export { formatBytes };
