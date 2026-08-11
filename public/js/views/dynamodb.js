import { api } from '../api.js';
import { escapeHtml, setStatus, showError, showLoading } from '../ui.js';

let currentTable = '';
let tableData;

function openEditor(container, item = {}) {
  container.querySelector('#editor-title').textContent = Object.keys(item).length ? 'Editar item' : 'Novo item';
  container.querySelector('#item-json').value = JSON.stringify(item, null, 2);
  container.querySelector('#editor').showModal();
}

async function loadItems(container, tableName) {
  currentTable = tableName;
  const area = container.querySelector('#table-content');
  showLoading(area, `Lendo ${tableName}…`);
  try {
    tableData = await api.table(tableName);
    const columns = [...new Set(tableData.items.flatMap(Object.keys))];
    area.innerHTML = `<div class="table-toolbar"><div><span class="eyebrow">TABELA</span><h2>${escapeHtml(tableName)}</h2><p>${tableData.count} item(ns) · Chave: ${escapeHtml(tableData.keys.join(' + '))}</p></div><button class="button primary" id="new-item">＋ Novo item</button></div>${tableData.items.length ? `<div class="table-scroll"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}<th></th></tr></thead><tbody>${tableData.items.map((item, index) => `<tr>${columns.map((column) => `<td><code>${escapeHtml(typeof item[column] === 'object' ? JSON.stringify(item[column]) : item[column] ?? '—')}</code></td>`).join('')}<td class="actions"><button data-edit="${index}" title="Editar">✎</button><button data-delete="${index}" title="Excluir">⌫</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>Tabela vazia</b><span>Adicione o primeiro item para começar.</span></div>'}`;
    area.querySelector('#new-item').onclick = () => openEditor(container);
    area.querySelectorAll('[data-edit]').forEach((button) => button.onclick = () => openEditor(container, tableData.items[button.dataset.edit]));
    area.querySelectorAll('[data-delete]').forEach((button) => button.onclick = async () => {
      const item = tableData.items[button.dataset.delete];
      const key = Object.fromEntries(tableData.keys.map((name) => [name, item[name]]));
      if (!confirm(`Excluir ${JSON.stringify(key)}?`)) return;
      try { await api.deleteItem(currentTable, key); setStatus('Item excluído'); await loadItems(container, currentTable); } catch (error) { setStatus(error.message, 'error'); }
    });
  } catch (error) { showError(area, error); }
}

export async function renderDynamo(container) {
  showLoading(container, 'Listando tabelas…');
  try {
    const { tables } = await api.tables();
    container.innerHTML = `<div class="page-head"><div><span class="eyebrow">BANCO DE DADOS</span><h1>DynamoDB</h1><p>Consulte e gerencie itens em áreas separadas por tabela.</p></div></div><section class="dynamo-layout"><aside class="table-list"><label>TABELAS</label>${tables.map((table, index) => `<button class="table-option ${index === 0 ? 'active' : ''}" data-table="${escapeHtml(table)}"><span>▦</span>${escapeHtml(table)}</button>`).join('') || '<div class="empty"><span>Nenhuma tabela</span></div>'}</aside><div id="table-content"><div class="empty"><b>Selecione uma tabela</b></div></div></section>
      <dialog id="editor"><form method="dialog"><div class="dialog-head"><div><span class="eyebrow">DYNAMODB</span><h2 id="editor-title">Novo item</h2></div><button class="icon-button" value="cancel">×</button></div><label for="item-json">Item em JSON</label><textarea id="item-json" spellcheck="false"></textarea><p class="hint">Tipos JSON são convertidos automaticamente para tipos DynamoDB.</p><div class="dialog-actions"><button class="button secondary" value="cancel">Cancelar</button><button class="button primary" id="save-item" value="default">Salvar item</button></div></form></dialog>`;
    container.querySelectorAll('[data-table]').forEach((button) => button.onclick = () => {
      container.querySelectorAll('[data-table]').forEach((item) => item.classList.toggle('active', item === button));
      loadItems(container, button.dataset.table);
    });
    container.querySelector('#editor').addEventListener('close', async (event) => {
      if (event.target.returnValue !== 'default') return;
      try { await api.saveItem(currentTable, JSON.parse(container.querySelector('#item-json').value)); setStatus('Item salvo com sucesso'); await loadItems(container, currentTable); } catch (error) { setStatus(error.message, 'error'); }
    });
    if (tables[0]) loadItems(container, tables[0]);
  } catch (error) { showError(container, error); }
}
