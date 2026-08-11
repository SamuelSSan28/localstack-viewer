import { api } from '../api.js';
import { escapeHtml, setStatus, showError, showLoading } from '../ui.js';

let currentTable = '';
let tableData;
let editingTypes = {};

const typeNames = { S: 'String', N: 'Number', BOOL: 'Boolean', NULL: 'Null', M: 'Map', L: 'List', SS: 'Strings', NS: 'Numbers', B: 'Binary' };

function renderAttribute(value, type) {
  const label = `<span class="attribute-type type-${escapeHtml(type)}">${escapeHtml(typeNames[type] || type)}</span>`;
  if (type === 'BOOL') return `${label}<span class="boolean-value ${value ? 'true' : 'false'}">${value ? 'true' : 'false'}</span>`;
  if (type === 'NULL') return `${label}<span class="null-value">null</span>`;
  if (['M', 'L', 'SS', 'NS'].includes(type)) return `${label}<details class="inline-json"><summary>${Array.isArray(value) ? `${value.length} item(s)` : 'View object'}</summary><pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre></details>`;
  return `${label}<code class="value-${escapeHtml(type)}">${escapeHtml(value ?? '—')}</code>`;
}

function openEditor(container, item = {}, types = {}) {
  editingTypes = types;
  container.querySelector('#editor-title').textContent = Object.keys(item).length ? 'Edit item' : 'New item';
  container.querySelector('#item-json').value = JSON.stringify(item, null, 2);
  container.querySelector('#editor').showModal();
}

async function loadItems(container, tableName) {
  currentTable = tableName;
  const area = container.querySelector('#table-content');
  showLoading(area, `Reading ${tableName}…`);
  try {
    tableData = await api.table(tableName);
    const columns = [...new Set(tableData.items.flatMap(Object.keys))];
    area.innerHTML = `<div class="table-toolbar"><div><span class="eyebrow">TABLE</span><h2>${escapeHtml(tableName)}</h2><p>${tableData.count} item(s) · Key: ${escapeHtml(tableData.keys.join(' + '))}</p></div><button class="button primary" id="new-item">＋ New item</button></div>${tableData.items.length ? `<div class="table-scroll"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}<th></th></tr></thead><tbody>${tableData.items.map((item, index) => `<tr>${columns.map((column) => `<td class="attribute-cell">${renderAttribute(item[column], tableData.types[index][column] || 'NULL')}</td>`).join('')}<td class="actions"><button data-edit="${index}" title="Edit">✎</button><button data-delete="${index}" title="Delete">⌫</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>Empty table</b><span>Add the first item to get started.</span></div>'}`;
    area.querySelector('#new-item').onclick = () => openEditor(container);
    area.querySelectorAll('[data-edit]').forEach((button) => button.onclick = () => openEditor(container, tableData.items[button.dataset.edit], tableData.types[button.dataset.edit]));
    area.querySelectorAll('[data-delete]').forEach((button) => button.onclick = async () => {
      const item = tableData.items[button.dataset.delete];
      const key = Object.fromEntries(tableData.keys.map((name) => [name, item[name]]));
      if (!confirm(`Delete ${JSON.stringify(key)}?`)) return;
      try { await api.deleteItem(currentTable, key); setStatus('Item deleted'); await loadItems(container, currentTable); } catch (error) { setStatus(error.message, 'error'); }
    });
  } catch (error) { showError(area, error); }
}

export async function renderDynamo(container) {
  showLoading(container, 'Listing tables…');
  try {
    const { tables } = await api.tables();
    container.innerHTML = `<div class="page-head"><div><span class="eyebrow">DATABASE</span><h1>DynamoDB</h1><p>Inspect and manage items in a dedicated workspace for each table.</p></div></div><section class="dynamo-layout"><aside class="table-list"><label>TABLES</label>${tables.map((table, index) => `<button class="table-option ${index === 0 ? 'active' : ''}" data-table="${escapeHtml(table)}"><span>▦</span>${escapeHtml(table)}</button>`).join('') || '<div class="empty"><span>No tables found</span></div>'}</aside><div id="table-content"><div class="empty"><b>Select a table</b></div></div></section>
      <dialog id="editor"><form method="dialog"><div class="dialog-head"><div><span class="eyebrow">DYNAMODB</span><h2 id="editor-title">New item</h2></div><button class="icon-button" value="cancel">×</button></div><label for="item-json">JSON item</label><textarea id="item-json" spellcheck="false"></textarea><p class="hint">JSON values are automatically converted to DynamoDB types.</p><div class="dialog-actions"><button class="button secondary" value="cancel">Cancel</button><button class="button primary" id="save-item" value="default">Save item</button></div></form></dialog>`;
    container.querySelectorAll('[data-table]').forEach((button) => button.onclick = () => {
      container.querySelectorAll('[data-table]').forEach((item) => item.classList.toggle('active', item === button));
      loadItems(container, button.dataset.table);
    });
    container.querySelector('#editor').addEventListener('close', async (event) => {
      if (event.target.returnValue !== 'default') return;
      try { await api.saveItem(currentTable, JSON.parse(container.querySelector('#item-json').value), editingTypes); setStatus('Item saved'); await loadItems(container, currentTable); } catch (error) { setStatus(error.message, 'error'); }
    });
    if (tables[0]) loadItems(container, tables[0]);
  } catch (error) { showError(container, error); }
}
