async function request(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação');
  return data;
}

export const api = {
  catalog: () => request('/api/services'),
  emails: () => request('/api/emails'),
  tables: () => request('/api/dynamodb/tables'),
  table: (name) => request(`/api/dynamodb/tables/${encodeURIComponent(name)}/items`),
  saveItem: (name, item) => request(`/api/dynamodb/tables/${encodeURIComponent(name)}/items`, { method: 'PUT', body: JSON.stringify({ item }) }),
  deleteItem: (name, key) => request(`/api/dynamodb/tables/${encodeURIComponent(name)}/items`, { method: 'DELETE', body: JSON.stringify({ key }) }),
};
