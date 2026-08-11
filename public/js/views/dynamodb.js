import { api } from '../api.js';
import { escapeHtml, setStatus, showError, showLoading } from '../ui.js';

const STORAGE_KEY = 'localstack-viewer:dynamodb';
let currentTable = '';
let tableData;
let editingSchema = {};
let editingTable = '';
let editingItem = {};
let editingExistingItem = false;
let loadGeneration = 0;
let selectedRows = new Set();
let state = readState();

const typeNames = { S: 'String', N: 'Number', BOOL: 'Boolean', NULL: 'Null', M: 'Map', L: 'List', SS: 'Strings', NS: 'Numbers', B: 'Binary' };

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      pinnedTables: Array.isArray(saved.pinnedTables) ? saved.pinnedTables : [],
      selectedTable: typeof saved.selectedTable === 'string' ? saved.selectedTable : '',
      tableSearch: typeof saved.tableSearch === 'string' ? saved.tableSearch : '',
      itemFilters: saved.itemFilters && typeof saved.itemFilters === 'object' ? saved.itemFilters : {},
    };
  } catch {
    return { pinnedTables: [], selectedTable: '', tableSearch: '', itemFilters: {} };
  }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Browsing still works when storage is unavailable. */ }
}

function tableFilter(tableName) {
  const filter = state.itemFilters[tableName];
  return filter && typeof filter === 'object' ? filter : { field: '', query: '' };
}

function updateTableFilter(tableName, patch) {
  state.itemFilters[tableName] = { ...tableFilter(tableName), ...patch };
  saveState();
}

function matchesItem(item, filter) {
  const query = filter.query.trim().toLocaleLowerCase();
  if (!query) return true;
  const values = filter.field ? [item[filter.field]] : Object.values(item);
  return values.some((value) => String(JSON.stringify(value ?? null)).toLocaleLowerCase().includes(query));
}

function renderAttribute(value, type) {
  const label = `<span class="attribute-type type-${escapeHtml(type)}">${escapeHtml(typeNames[type] || type)}</span>`;
  if (type === 'BOOL') return `${label}<span class="boolean-value ${value ? 'true' : 'false'}">${value ? 'true' : 'false'}</span>`;
  if (type === 'NULL') return `${label}<span class="null-value">null</span>`;
  if (['M', 'L', 'SS', 'NS'].includes(type)) return `${label}<details class="inline-json"><summary>${Array.isArray(value) ? `${value.length} item(s)` : 'View object'}</summary><pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre></details>`;
  return `${label}<code class="value-${escapeHtml(type)}">${escapeHtml(value ?? '—')}</code>`;
}

function setEditorMode(container, mode) {
  const isEditing = mode === 'edit';
  container.querySelector('#editor-view').hidden = isEditing;
  container.querySelector('#editor-edit').hidden = !isEditing;
  container.querySelector('#edit-item').hidden = isEditing;
  container.querySelector('#save-item').hidden = !isEditing;
  container.querySelector('#back-to-view').hidden = !isEditing || !editingExistingItem;
  container.querySelector('#editor-close').textContent = isEditing && !editingExistingItem ? 'Cancel' : 'Close';
  if (isEditing) container.querySelector('#item-json').focus();
}

function openEditor(container, tableName, item = {}, schema = {}, mode = 'edit') {
  editingTable = tableName;
  editingSchema = schema;
  editingItem = item;
  editingExistingItem = Object.keys(item).length > 0;
  container.querySelector('#editor-title').textContent = editingExistingItem ? 'Item details' : 'New item';
  container.querySelector('#item-json').value = JSON.stringify(item, null, 2);
  container.querySelector('#item-json-preview').textContent = JSON.stringify(item, null, 2);
  setEditorMode(container, mode);
  container.querySelector('#editor').showModal();
}

function itemKey(index) {
  const item = tableData.items[index];
  return Object.fromEntries(tableData.keys.map((name) => [name, item[name]]));
}

async function deleteRows(container, tableName, indices) {
  const label = indices.length === 1 ? JSON.stringify(itemKey(indices[0])) : `${indices.length} selected items`;
  if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
  try {
    await Promise.all(indices.map((index) => {
      const key = itemKey(index);
      const schema = Object.fromEntries(tableData.keys.map((name) => [name, tableData.schemas[index][name]]));
      return api.deleteItem(tableName, key, schema);
    }));
    selectedRows.clear();
    setStatus(`${indices.length} item(s) deleted`);
    await loadItems(container, tableName);
  } catch (error) {
    setStatus(error.message, 'error');
    await loadItems(container, tableName);
  }
}

function renderItems(container, tableName) {
  const area = container.querySelector('#table-content');
  const columns = [...new Set(tableData.items.flatMap(Object.keys))];
  const filter = tableFilter(tableName);
  const visibleIndices = tableData.items.map((_, index) => index).filter((index) => matchesItem(tableData.items[index], filter));
  selectedRows = new Set([...selectedRows].filter((index) => visibleIndices.includes(index)));
  area.innerHTML = `<div class="table-toolbar"><div><span class="eyebrow">TABLE</span><h2>${escapeHtml(tableName)}</h2><p>${tableData.count} item(s) · Key: ${escapeHtml(tableData.keys.join(' + '))}</p></div><button class="button primary" id="new-item">＋ New item</button></div>
    <div class="item-tools"><div class="item-filter"><span class="search-icon">⌕</span><input id="item-search" type="search" placeholder="Filter items…" value="${escapeHtml(filter.query)}" aria-label="Filter table items"><select id="filter-field" aria-label="Filter field"><option value="">All fields</option>${columns.map((column) => `<option value="${escapeHtml(column)}" ${filter.field === column ? 'selected' : ''}>${escapeHtml(column)}</option>`).join('')}</select>${filter.query ? '<button class="clear-filter" id="clear-filter">Clear</button>' : ''}</div><button class="button danger bulk-delete" id="bulk-delete" ${selectedRows.size ? '' : 'disabled'}>Delete selected <span>${selectedRows.size || ''}</span></button></div>
    ${tableData.items.length ? `<div class="table-scroll"><table><thead><tr><th class="select-cell"><input type="checkbox" id="select-all" aria-label="Select all visible items" ${visibleIndices.length && visibleIndices.every((index) => selectedRows.has(index)) ? 'checked' : ''}></th>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}<th></th></tr></thead><tbody>${visibleIndices.map((index) => { const item = tableData.items[index]; return `<tr><td class="select-cell"><input type="checkbox" data-select="${index}" aria-label="Select item ${index + 1}" ${selectedRows.has(index) ? 'checked' : ''}></td>${columns.map((column) => `<td class="attribute-cell">${renderAttribute(item[column], tableData.types[index][column] || 'NULL')}</td>`).join('')}<td class="actions"><button data-edit="${index}" title="Edit">✎</button><button data-delete="${index}" title="Delete">⌫</button></td></tr>`; }).join('')}</tbody></table></div>${visibleIndices.length ? '' : '<div class="filter-empty"><b>No matching items</b><span>Try another field or search term.</span></div>'}` : '<div class="empty"><b>Empty table</b><span>Add the first item to get started.</span></div>'}`;

  area.querySelector('#new-item').onclick = () => openEditor(container, tableName);
  area.querySelector('#item-search').oninput = (event) => { updateTableFilter(tableName, { query: event.target.value }); renderItems(container, tableName); container.querySelector('#item-search').focus(); };
  area.querySelector('#filter-field').onchange = (event) => { updateTableFilter(tableName, { field: event.target.value }); renderItems(container, tableName); };
  area.querySelector('#clear-filter')?.addEventListener('click', () => { updateTableFilter(tableName, { query: '', field: '' }); renderItems(container, tableName); });
  area.querySelector('#bulk-delete').onclick = () => deleteRows(container, tableName, [...selectedRows]);
  const selectAll = area.querySelector('#select-all');
  if (selectAll) selectAll.onchange = (event) => { visibleIndices.forEach((index) => event.target.checked ? selectedRows.add(index) : selectedRows.delete(index)); renderItems(container, tableName); };
  area.querySelectorAll('[data-select]').forEach((checkbox) => checkbox.onchange = () => { const index = Number(checkbox.dataset.select); checkbox.checked ? selectedRows.add(index) : selectedRows.delete(index); renderItems(container, tableName); });
  area.querySelectorAll('tbody tr').forEach((row) => row.onclick = (event) => {
    if (event.target.closest('button, input, details, a')) return;
    const index = Number(row.querySelector('[data-select]').dataset.select);
    openEditor(container, tableName, tableData.items[index], tableData.schemas[index], 'view');
  });
  area.querySelectorAll('[data-edit]').forEach((button) => button.onclick = () => openEditor(container, tableName, tableData.items[button.dataset.edit], tableData.schemas[button.dataset.edit], 'edit'));
  area.querySelectorAll('[data-delete]').forEach((button) => button.onclick = () => deleteRows(container, tableName, [Number(button.dataset.delete)]));
}

async function loadItems(container, tableName) {
  const generation = ++loadGeneration;
  currentTable = tableName;
  state.selectedTable = tableName;
  saveState();
  selectedRows.clear();
  const area = container.querySelector('#table-content');
  showLoading(area, `Reading ${tableName}…`);
  try {
    const data = await api.table(tableName);
    if (generation !== loadGeneration || currentTable !== tableName) return;
    tableData = data;
    renderItems(container, tableName);
  } catch (error) {
    if (generation === loadGeneration && currentTable === tableName) showError(area, error);
  }
}

function sortedTables(tables) {
  return [...tables].sort((a, b) => Number(state.pinnedTables.includes(b)) - Number(state.pinnedTables.includes(a)) || a.localeCompare(b));
}

function renderTableList(container, tables) {
  const list = container.querySelector('#table-options');
  const query = state.tableSearch.trim().toLocaleLowerCase();
  const visible = sortedTables(tables).filter((table) => table.toLocaleLowerCase().includes(query));
  list.innerHTML = visible.map((table) => `<div class="table-option-row ${table === currentTable ? 'active' : ''}"><button class="table-option" data-table="${escapeHtml(table)}" title="${escapeHtml(table)}"><span>▦</span><b>${escapeHtml(table)}</b></button><button class="pin-button ${state.pinnedTables.includes(table) ? 'pinned' : ''}" data-pin="${escapeHtml(table)}" title="${state.pinnedTables.includes(table) ? 'Unpin table' : 'Pin table'}" aria-label="${state.pinnedTables.includes(table) ? 'Unpin' : 'Pin'} ${escapeHtml(table)}">★</button></div>`).join('') || '<div class="list-empty">No matching tables</div>';
  list.querySelectorAll('[data-table]').forEach((button) => button.onclick = () => { currentTable = button.dataset.table; renderTableList(container, tables); loadItems(container, button.dataset.table); });
  list.querySelectorAll('[data-pin]').forEach((button) => button.onclick = () => {
    const table = button.dataset.pin;
    state.pinnedTables = state.pinnedTables.includes(table) ? state.pinnedTables.filter((name) => name !== table) : [...state.pinnedTables, table];
    saveState();
    renderTableList(container, tables);
  });
}

export async function renderDynamo(container) {
  loadGeneration += 1;
  state = readState();
  showLoading(container, 'Listing tables…');
  try {
    const { tables } = await api.tables();
    currentTable = tables.includes(state.selectedTable) ? state.selectedTable : sortedTables(tables)[0] || '';
    container.innerHTML = `<div class="page-head"><div><span class="eyebrow">DATABASE</span><h1>DynamoDB</h1><p>Inspect and manage items in a dedicated workspace for each table.</p></div></div><section class="dynamo-layout"><aside class="table-list"><label>TABLES</label><div class="table-search"><span>⌕</span><input id="table-search" type="search" placeholder="Search tables…" value="${escapeHtml(state.tableSearch)}" aria-label="Search tables"></div><div id="table-options"></div></aside><div id="table-content"><div class="empty"><b>Select a table</b></div></div></section>
      <dialog id="editor"><div class="dialog-head"><div><span class="eyebrow">DYNAMODB</span><h2 id="editor-title">Item details</h2></div><button class="icon-button dialog-x" id="dialog-x" aria-label="Close">×</button></div><div id="editor-view"><div class="json-preview-head"><span>JSON item</span><button class="button secondary" id="edit-item">✎ Edit</button></div><pre class="item-json-preview" id="item-json-preview"></pre></div><div id="editor-edit" hidden><label for="item-json">JSON item</label><textarea id="item-json" spellcheck="false"></textarea><p class="hint">JSON values are automatically converted to DynamoDB types.</p></div><div class="dialog-actions"><button class="button secondary" id="back-to-view" hidden>Back to view</button><button class="button secondary" id="editor-close">Close</button><button class="button primary" id="save-item" hidden>Save item</button></div></dialog>`;
    renderTableList(container, tables);
    container.querySelector('#table-search').oninput = (event) => { state.tableSearch = event.target.value; saveState(); renderTableList(container, tables); };
    const editor = container.querySelector('#editor');
    container.querySelector('#dialog-x').onclick = () => editor.close();
    container.querySelector('#editor-close').onclick = () => editor.close();
    container.querySelector('#edit-item').onclick = () => setEditorMode(container, 'edit');
    container.querySelector('#back-to-view').onclick = () => {
      container.querySelector('#item-json').value = JSON.stringify(editingItem, null, 2);
      setEditorMode(container, 'view');
    };
    container.querySelector('#save-item').onclick = async () => {
      try {
        await api.saveItem(editingTable, JSON.parse(container.querySelector('#item-json').value), editingSchema);
        editor.close();
        setStatus('Item saved');
        await loadItems(container, editingTable);
      } catch (error) { setStatus(error.message, 'error'); }
    };
    if (currentTable) loadItems(container, currentTable);
  } catch (error) { showError(container, error); }
}
