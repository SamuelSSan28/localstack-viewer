import { api } from '../api.js';
import { escapeHtml, setStatus, showError, showLoading } from '../ui.js';

const STORAGE_KEY = 'localstack-viewer:dynamodb';
export const PAGE_SIZE = 10;
let currentTable = '';
let tableData;
let currentPage = 1;
let editingSchema = {};
let editingTable = '';
let editingItem = {};
let editingExistingItem = false;
let loadGeneration = 0;
let selectedRows = new Set();
let state = readState();

const typeNames = {
  S: 'String',
  N: 'Number',
  BOOL: 'Boolean',
  NULL: 'Null',
  M: 'Map',
  L: 'List',
  SS: 'Strings',
  NS: 'Numbers',
  B: 'Binary',
};

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      pinnedTables: Array.isArray(saved.pinnedTables) ? saved.pinnedTables : [],
      selectedTable: typeof saved.selectedTable === 'string' ? saved.selectedTable : '',
      tableSearch: typeof saved.tableSearch === 'string' ? saved.tableSearch : '',
      itemFilters:
        saved.itemFilters && typeof saved.itemFilters === 'object' ? saved.itemFilters : {},
      itemSorts: saved.itemSorts && typeof saved.itemSorts === 'object' ? saved.itemSorts : {},
      pinnedFields:
        saved.pinnedFields && typeof saved.pinnedFields === 'object' ? saved.pinnedFields : {},
    };
  } catch {
    return {
      pinnedTables: [],
      selectedTable: '',
      tableSearch: '',
      itemFilters: {},
      itemSorts: {},
      pinnedFields: {},
    };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Browsing still works when storage is unavailable. */
  }
}

function tableFilter(tableName) {
  const filter = state.itemFilters[tableName];
  return filter && typeof filter === 'object' ? filter : { field: '', query: '' };
}

function updateTableFilter(tableName, patch) {
  state.itemFilters[tableName] = { ...tableFilter(tableName), ...patch };
  selectedRows.clear();
  saveState();
}

function matchesItem(item, filter) {
  const query = filter.query.trim().toLocaleLowerCase();
  if (!query) return true;
  const values = filter.field ? [item[filter.field]] : Object.values(item);
  return values.some((value) =>
    String(JSON.stringify(value ?? null))
      .toLocaleLowerCase()
      .includes(query),
  );
}

function tableSort(tableName) {
  const sort = state.itemSorts[tableName];
  return sort && typeof sort.column === 'string' ? sort : { column: '', direction: '' };
}

function sortableValue(value, type) {
  if (value === undefined || value === null) return { missing: true, value: '' };
  if (type === 'N') return { missing: false, value: Number(value) };
  if (type === 'BOOL') return { missing: false, value: Number(value) };
  if (type === 'S' && /^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-]+Z?)?$/.test(value)) {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) return { missing: false, value: timestamp };
  }
  return { missing: false, value: typeof value === 'string' ? value : JSON.stringify(value) };
}

export function structuredPreview(value, type, limit = 72) {
  const json = JSON.stringify(value);
  const kind =
    type === 'M' ? 'Object' : type === 'L' ? `Array (${value.length})` : `Set (${value.length})`;
  const preview = json.length > limit ? `${json.slice(0, limit - 1)}…` : json;
  return { kind, preview };
}

export function parseJsonString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function parseEmbeddedJson(value) {
  if (Array.isArray(value)) return value.map((entry) => parseEmbeddedJson(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, parseEmbeddedJson(entry)]),
    );
  }
  const parsed = parseJsonString(value);
  return parsed ? parseEmbeddedJson(parsed) : value;
}

export function compareDynamoValues(left, right, leftType, rightType, direction = 'asc') {
  const a = sortableValue(left, leftType);
  const b = sortableValue(right, rightType);
  if (a.missing || b.missing) return a.missing === b.missing ? 0 : a.missing ? 1 : -1;
  const comparison =
    typeof a.value === 'number' && typeof b.value === 'number'
      ? a.value - b.value
      : String(a.value).localeCompare(String(b.value), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
  return direction === 'desc' ? -comparison : comparison;
}

function renderAttribute(value, type) {
  const parsedJson = type === 'S' ? parseJsonString(value) : null;
  if (parsedJson) {
    const jsonType = Array.isArray(parsedJson) ? 'L' : 'M';
    const { kind, preview } = structuredPreview(parsedJson, jsonType);
    return `<span class="attribute-type type-JSON">JSON</span><span class="structured-value json-value"><b>${escapeHtml(kind)}</b><code>${escapeHtml(preview)}</code></span>`;
  }
  const label = `<span class="attribute-type type-${escapeHtml(type)}">${escapeHtml(typeNames[type] || type)}</span>`;
  if (type === 'BOOL')
    return `${label}<span class="boolean-value ${value ? 'true' : 'false'}">${value ? 'true' : 'false'}</span>`;
  if (type === 'NULL') return `${label}<span class="null-value">null</span>`;
  if (['M', 'L', 'SS', 'NS'].includes(type)) {
    const { kind, preview } = structuredPreview(value, type);
    return `${label}<span class="structured-value"><b>${escapeHtml(kind)}</b><code>${escapeHtml(preview)}</code></span>`;
  }
  return `${label}<code class="value-${escapeHtml(type)}">${escapeHtml(value ?? '—')}</code>`;
}

export function clipboardValue(value) {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function orderedFieldNames(items, keyNames = [], pinnedNames = []) {
  const fields = new Set(items.flatMap((item) => Object.keys(item)));
  const keys = keyNames.filter((name) => fields.delete(name));
  const pinned = pinnedNames.filter((name) => fields.delete(name));
  return [...keys, ...pinned, ...[...fields].sort((left, right) => left.localeCompare(right))];
}

export function orderJsonValue(value, keyNames = []) {
  if (Array.isArray(value)) return value.map((entry) => orderJsonValue(entry));
  if (!value || typeof value !== 'object') return value;
  const fields = orderedFieldNames([value], keyNames);
  return Object.fromEntries(fields.map((name) => [name, orderJsonValue(value[name])]));
}

function editorJson(item, keyNames = [], parseStrings = false) {
  const value = parseStrings ? parseEmbeddedJson(item) : item;
  return JSON.stringify(orderJsonValue(value, keyNames), null, 2);
}

async function copyToClipboard(value, label = 'Value') {
  const text = clipboardValue(value);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const temporary = document.createElement('textarea');
      temporary.value = text;
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.append(temporary);
      temporary.select();
      const copied = document.execCommand('copy');
      temporary.remove();
      if (!copied) throw new Error('Copy command was rejected');
    }
    setStatus(`${label} copied to clipboard`);
  } catch {
    setStatus('Unable to copy to clipboard', 'error');
  }
}

function setEditorMode(container, mode) {
  const isEditing = mode === 'edit';
  const editor = container.querySelector('#item-json');
  editor.readOnly = !isEditing;
  editor.classList.toggle('is-readonly', !isEditing);
  container.querySelector('#edit-item').hidden = isEditing;
  container.querySelector('#save-item').hidden = !isEditing;
  container.querySelector('#back-to-view').hidden = !isEditing || !editingExistingItem;
  container.querySelector('#editor-close').textContent =
    isEditing && !editingExistingItem ? 'Cancel' : 'Close';
  container.querySelector('#editor-hint').hidden = !isEditing;
  editor.focus();
}

function openEditor(container, tableName, item = {}, schema = {}, mode = 'edit') {
  editingTable = tableName;
  editingSchema = schema;
  editingItem = item;
  editingExistingItem = Object.keys(item).length > 0;
  container.querySelector('#editor-title').textContent = editingExistingItem
    ? 'Item details'
    : 'New item';
  container.querySelector('#item-json').value = editorJson(
    item,
    tableData?.keys || [],
    mode === 'view',
  );
  setEditorMode(container, mode);
  container.querySelector('#editor').showModal();
  const editor = container.querySelector('#item-json');
  editor.scrollTop = 0;
  editor.focus({ preventScroll: true });
}

function itemKey(index) {
  const item = tableData.items[index];
  return Object.fromEntries(tableData.keys.map((name) => [name, item[name]]));
}

async function deleteRows(container, tableName, indices) {
  const label =
    indices.length === 1 ? JSON.stringify(itemKey(indices[0])) : `${indices.length} selected items`;
  if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
  try {
    await Promise.all(
      indices.map((index) => {
        const key = itemKey(index);
        const schema = Object.fromEntries(
          tableData.keys.map((name) => [name, tableData.schemas[index][name]]),
        );
        return api.deleteItem(tableName, key, schema);
      }),
    );
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
  const pinnedFields = Array.isArray(state.pinnedFields[tableName])
    ? state.pinnedFields[tableName]
    : [];
  const columns = orderedFieldNames(tableData.items, tableData.keys, pinnedFields);
  const filter = tableFilter(tableName);
  const sort = tableSort(tableName);
  const visibleIndices = tableData.items
    .map((_, index) => index)
    .filter((index) => matchesItem(tableData.items[index], filter))
    .sort((left, right) =>
      sort.column
        ? compareDynamoValues(
            tableData.items[left][sort.column],
            tableData.items[right][sort.column],
            tableData.types[left][sort.column],
            tableData.types[right][sort.column],
            sort.direction,
          ) || left - right
        : left - right,
    );
  const totalPages = Math.max(1, Math.ceil(visibleIndices.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageIndices = visibleIndices.slice(pageStart, pageStart + PAGE_SIZE);
  selectedRows = new Set([...selectedRows].filter((index) => visibleIndices.includes(index)));
  area.innerHTML = `<div class="table-toolbar"><div><span class="eyebrow">TABLE</span><h2>${escapeHtml(tableName)}</h2><p>${tableData.count} item(s) · Key: ${escapeHtml(tableData.keys.join(' + '))}</p></div><div class="table-toolbar-actions"><button class="button secondary" id="refresh-items">↻ Refresh</button><button class="button primary" id="new-item">＋ New item</button></div></div>
    <div class="item-tools"><div class="item-filter"><span class="search-icon">⌕</span><input id="item-search" type="search" placeholder="Filter items…" value="${escapeHtml(filter.query)}" aria-label="Filter table items"><select id="filter-field" aria-label="Filter field"><option value="">All fields</option>${columns.map((column) => `<option value="${escapeHtml(column)}" ${filter.field === column ? 'selected' : ''}>${escapeHtml(column)}</option>`).join('')}</select>${filter.query ? '<button class="clear-filter" id="clear-filter">Clear</button>' : ''}</div><div class="selection-actions"><button class="button secondary bulk-copy" id="bulk-copy" ${pageIndices.some((index) => selectedRows.has(index)) ? '' : 'disabled'}>▣ Copy selected <span>${pageIndices.filter((index) => selectedRows.has(index)).length || ''}</span></button><button class="button danger bulk-delete" id="bulk-delete" ${selectedRows.size ? '' : 'disabled'}>Delete selected <span>${selectedRows.size || ''}</span></button></div></div>
    ${
      tableData.items.length
        ? `<div class="table-scroll"><table><thead><tr><th class="select-cell"><input type="checkbox" id="select-all" aria-label="Select all items on this page" ${pageIndices.length && pageIndices.every((index) => selectedRows.has(index)) ? 'checked' : ''}></th>${columns
            .map((column) => {
              const isKey = tableData.keys.includes(column);
              const isPinned = pinnedFields.includes(column);
              return `<th><span class="column-head"><span class="column-name"><button class="copy-column" data-copy-column="${escapeHtml(column)}" title="Copy column name">${escapeHtml(column)}</button>${isKey ? '<span class="key-attribute" title="Key attribute" aria-label="Key attribute">★</span>' : `<button class="pin-field ${isPinned ? 'pinned' : ''}" data-pin-field="${escapeHtml(column)}" title="${isPinned ? 'Unpin field' : 'Pin field after key columns'}" aria-label="${isPinned ? 'Unpin' : 'Pin'} field ${escapeHtml(column)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v5M5 17h14M17 8V5H7v3a2 2 0 0 0 2 2v3l-2 2v2h10v-2l-2-2v-3a2 2 0 0 0 2-2Z"/></svg></button>`}</span><button class="sort-column ${sort.column === column ? 'active' : ''}" data-sort="${escapeHtml(column)}" aria-label="Sort by ${escapeHtml(column)}" aria-sort="${sort.column === column ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}"><span class="sort-indicator">${sort.column === column ? (sort.direction === 'asc' ? '▲' : '▼') : '⇅'}</span></button></span></th>`;
            })
            .join('')}<th class="actions actions-head">Actions</th></tr></thead><tbody>${pageIndices
            .map((index) => {
              const item = tableData.items[index];
              return `<tr><td class="select-cell"><input type="checkbox" data-select="${index}" aria-label="Select item ${index + 1}" ${selectedRows.has(index) ? 'checked' : ''}></td>${columns.map((column) => `<td class="attribute-cell copy-cell" data-copy-row="${index}" data-copy-field="${escapeHtml(column)}" title="Copy cell value">${renderAttribute(item[column], tableData.types[index][column] || 'NULL')}</td>`).join('')}<td class="actions"><button class="row-action view-edit-action" data-view="${index}" title="View or edit item" aria-label="View or edit item"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c5.5 0 9.5 7 9.5 7s-4 7-9.5 7S2.5 12 2.5 12 6.5 5 12 5Z"/><circle cx="12" cy="12" r="3"/></svg></button><button class="row-action delete-action" data-delete="${index}" title="Delete item" aria-label="Delete item"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg></button></td></tr>`;
            })
            .join(
              '',
            )}</tbody></table></div>${visibleIndices.length ? `<nav class="table-pagination" aria-label="Table pagination"><span>${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, visibleIndices.length)} of ${visibleIndices.length}</span><div><button class="button secondary" id="previous-page" ${currentPage === 1 ? 'disabled' : ''} aria-label="Previous page">‹ Previous</button><span>Page ${currentPage} of ${totalPages}</span><button class="button secondary" id="next-page" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Next page">Next ›</button></div></nav>` : '<div class="filter-empty"><b>No matching items</b><span>Try another field or search term.</span></div>'}`
        : '<div class="empty"><b>Empty table</b><span>Add the first item to get started.</span></div>'
    }`;

  area.querySelector('#new-item').onclick = () => openEditor(container, tableName);
  area.querySelector('#refresh-items').onclick = () => loadItems(container, tableName);
  area.querySelector('#item-search').oninput = (event) => {
    const selectionStart = event.target.selectionStart;
    const selectionEnd = event.target.selectionEnd;
    currentPage = 1;
    updateTableFilter(tableName, { query: event.target.value });
    renderItems(container, tableName);
    const search = container.querySelector('#item-search');
    search.focus();
    search.setSelectionRange(selectionStart, selectionEnd);
  };
  area.querySelector('#filter-field').onchange = (event) => {
    currentPage = 1;
    updateTableFilter(tableName, { field: event.target.value });
    renderItems(container, tableName);
  };
  area.querySelector('#clear-filter')?.addEventListener('click', () => {
    currentPage = 1;
    updateTableFilter(tableName, { query: '', field: '' });
    renderItems(container, tableName);
  });
  area.querySelector('#bulk-delete').onclick = () =>
    deleteRows(container, tableName, [...selectedRows]);
  area.querySelector('#bulk-copy').onclick = () => {
    const items = pageIndices
      .filter((index) => selectedRows.has(index))
      .map((index) => parseEmbeddedJson(tableData.items[index]));
    copyToClipboard(items, `${items.length} selected item(s)`);
  };
  area.querySelectorAll('[data-sort]').forEach(
    (button) =>
      (button.onclick = () => {
        const column = button.dataset.sort;
        state.itemSorts[tableName] = {
          column,
          direction: sort.column === column && sort.direction === 'asc' ? 'desc' : 'asc',
        };
        currentPage = 1;
        saveState();
        renderItems(container, tableName);
      }),
  );
  area
    .querySelectorAll('[data-copy-column]')
    .forEach(
      (button) =>
        (button.onclick = () => copyToClipboard(button.dataset.copyColumn, 'Column name')),
    );
  area.querySelectorAll('[data-pin-field]').forEach(
    (button) =>
      (button.onclick = () => {
        const field = button.dataset.pinField;
        state.pinnedFields[tableName] = pinnedFields.includes(field)
          ? pinnedFields.filter((name) => name !== field)
          : [...pinnedFields, field];
        saveState();
        renderItems(container, tableName);
      }),
  );
  area
    .querySelectorAll('[data-copy-row]')
    .forEach(
      (cell) =>
        (cell.onclick = () =>
          copyToClipboard(
            tableData.items[Number(cell.dataset.copyRow)][cell.dataset.copyField],
            'Cell value',
          )),
    );
  const selectAll = area.querySelector('#select-all');
  if (selectAll)
    selectAll.onchange = (event) => {
      pageIndices.forEach((index) =>
        event.target.checked ? selectedRows.add(index) : selectedRows.delete(index),
      );
      renderItems(container, tableName);
    };
  area.querySelector('#previous-page')?.addEventListener('click', () => {
    currentPage -= 1;
    renderItems(container, tableName);
  });
  area.querySelector('#next-page')?.addEventListener('click', () => {
    currentPage += 1;
    renderItems(container, tableName);
  });
  area.querySelectorAll('[data-select]').forEach(
    (checkbox) =>
      (checkbox.onchange = () => {
        const index = Number(checkbox.dataset.select);
        checkbox.checked ? selectedRows.add(index) : selectedRows.delete(index);
        renderItems(container, tableName);
      }),
  );
  area
    .querySelectorAll('[data-view]')
    .forEach(
      (button) =>
        (button.onclick = () =>
          openEditor(
            container,
            tableName,
            tableData.items[button.dataset.view],
            tableData.schemas[button.dataset.view],
            'view',
          )),
    );
  area
    .querySelectorAll('[data-delete]')
    .forEach(
      (button) =>
        (button.onclick = () => deleteRows(container, tableName, [Number(button.dataset.delete)])),
    );
}

async function loadItems(container, tableName) {
  const generation = ++loadGeneration;
  currentTable = tableName;
  state.selectedTable = tableName;
  saveState();
  selectedRows.clear();
  currentPage = 1;
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
  return [...tables].sort(
    (a, b) =>
      Number(state.pinnedTables.includes(b)) - Number(state.pinnedTables.includes(a)) ||
      a.localeCompare(b),
  );
}

function renderTableList(container, tables) {
  const list = container.querySelector('#table-options');
  const query = state.tableSearch.trim().toLocaleLowerCase();
  const visible = sortedTables(tables).filter((table) => table.toLocaleLowerCase().includes(query));
  list.innerHTML =
    visible
      .map(
        (table) =>
          `<div class="table-option-row ${table === currentTable ? 'active' : ''}"><button class="table-option" data-table="${escapeHtml(table)}" title="${escapeHtml(table)}"><span>▦</span><b>${escapeHtml(table)}</b></button><button class="pin-button ${state.pinnedTables.includes(table) ? 'pinned' : ''}" data-pin="${escapeHtml(table)}" title="${state.pinnedTables.includes(table) ? 'Unpin table' : 'Pin table'}" aria-label="${state.pinnedTables.includes(table) ? 'Unpin' : 'Pin'} ${escapeHtml(table)}">★</button></div>`,
      )
      .join('') || '<div class="list-empty">No matching tables</div>';
  list.querySelectorAll('[data-table]').forEach(
    (button) =>
      (button.onclick = () => {
        currentTable = button.dataset.table;
        renderTableList(container, tables);
        loadItems(container, button.dataset.table);
      }),
  );
  list.querySelectorAll('[data-pin]').forEach(
    (button) =>
      (button.onclick = () => {
        const table = button.dataset.pin;
        state.pinnedTables = state.pinnedTables.includes(table)
          ? state.pinnedTables.filter((name) => name !== table)
          : [...state.pinnedTables, table];
        saveState();
        renderTableList(container, tables);
      }),
  );
}

export async function renderDynamo(container) {
  loadGeneration += 1;
  state = readState();
  showLoading(container, 'Listing tables…');
  try {
    const { tables } = await api.tables();
    currentTable = tables.includes(state.selectedTable)
      ? state.selectedTable
      : sortedTables(tables)[0] || '';
    container.innerHTML = `<div class="page-head"><div><span class="eyebrow">DATABASE</span><h1>DynamoDB</h1><p>Inspect and manage items in a dedicated workspace for each table.</p></div></div><section class="dynamo-layout"><aside class="table-list"><label>TABLES</label><div class="table-search"><span>⌕</span><input id="table-search" type="search" placeholder="Search tables…" value="${escapeHtml(state.tableSearch)}" aria-label="Search tables"></div><div id="table-options"></div></aside><div id="table-content"><div class="empty"><b>Select a table</b></div></div></section>
      <dialog id="editor"><div class="dialog-head"><div><span class="eyebrow">DYNAMODB</span><h2 id="editor-title">Item details</h2></div><button class="icon-button dialog-x" id="dialog-x" aria-label="Close">×</button></div><div class="json-editor-head"><label for="item-json">JSON item</label><div class="editor-tools"><button class="button secondary" id="copy-item">▣ Copy all</button><button class="button secondary" id="edit-item">✎ Edit</button></div></div><textarea id="item-json" class="item-json-editor" spellcheck="false" readonly></textarea><p class="hint" id="editor-hint">JSON values are automatically converted to DynamoDB types.</p><div class="dialog-actions"><button class="button secondary" id="back-to-view" hidden>Back to view</button><button class="button secondary" id="editor-close">Close</button><button class="button primary" id="save-item" hidden>Save item</button></div></dialog>`;
    renderTableList(container, tables);
    container.querySelector('#table-search').oninput = (event) => {
      state.tableSearch = event.target.value;
      saveState();
      renderTableList(container, tables);
    };
    const editor = container.querySelector('#editor');
    container.querySelector('#dialog-x').onclick = () => editor.close();
    container.querySelector('#editor-close').onclick = () => editor.close();
    container.querySelector('#edit-item').onclick = () => {
      container.querySelector('#item-json').value = editorJson(
        editingItem,
        tableData?.keys || [],
      );
      setEditorMode(container, 'edit');
    };
    container.querySelector('#copy-item').onclick = () =>
      copyToClipboard(container.querySelector('#item-json').value, 'Item JSON');
    container.querySelector('#back-to-view').onclick = () => {
      container.querySelector('#item-json').value = editorJson(
        editingItem,
        tableData?.keys || [],
        true,
      );
      setEditorMode(container, 'view');
    };
    container.querySelector('#save-item').onclick = async () => {
      try {
        await api.saveItem(
          editingTable,
          JSON.parse(container.querySelector('#item-json').value),
          editingSchema,
        );
        editor.close();
        setStatus('Item saved');
        await loadItems(container, editingTable);
      } catch (error) {
        setStatus(error.message, 'error');
      }
    };
    if (currentTable) loadItems(container, currentTable);
  } catch (error) {
    showError(container, error);
  }
}
