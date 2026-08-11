export function unmarshallValue(value) {
  if ('S' in value) return value.S;
  if ('N' in value) return Number(value.N);
  if ('BOOL' in value) return value.BOOL;
  if ('NULL' in value) return null;
  if ('L' in value) return value.L.map(unmarshallValue);
  if ('M' in value) return unmarshall(value.M);
  if ('SS' in value) return value.SS;
  if ('NS' in value) return value.NS.map(Number);
  return value;
}

export function unmarshall(item = {}) {
  return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, unmarshallValue(value)]));
}

export function marshallValue(value) {
  if (value === null) return { NULL: true };
  if (typeof value === 'string') return { S: value };
  if (typeof value === 'number') return { N: String(value) };
  if (typeof value === 'boolean') return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(marshallValue) };
  if (typeof value === 'object') return { M: marshall(value) };
  throw new TypeError(`Unsupported DynamoDB type: ${typeof value}`);
}

export function marshall(item = {}, types = {}) {
  return Object.fromEntries(Object.entries(item).map(([key, value]) => {
    if (types[key] === 'SS') return [key, { SS: value.map(String) }];
    if (types[key] === 'NS') return [key, { NS: value.map(String) }];
    return [key, marshallValue(value)];
  }));
}
