export function unmarshallValue(value) {
  if ('S' in value) return value.S;
  // Numbers stay as strings so opening and saving an item can never round a
  // value outside JavaScript's safe integer range or truncate a decimal.
  if ('N' in value) return value.N;
  if ('BOOL' in value) return value.BOOL;
  if ('NULL' in value) return null;
  if ('L' in value) return value.L.map(unmarshallValue);
  if ('M' in value) return unmarshall(value.M);
  if ('SS' in value) return value.SS;
  if ('NS' in value) return value.NS;
  return value;
}

export function unmarshall(item = {}) {
  return Object.fromEntries(
    Object.entries(item).map(([key, value]) => [key, unmarshallValue(value)]),
  );
}

export function marshallValue(value, schema) {
  const type = typeof schema === 'string' ? schema : schema?.type;
  if (type === 'N') return { N: String(value) };
  if (type === 'SS') return { SS: value.map(String) };
  if (type === 'NS') return { NS: value.map(String) };
  if (type === 'L')
    return { L: value.map((item, index) => marshallValue(item, schema?.items?.[index])) };
  if (type === 'M') return { M: marshall(value, schema?.fields) };
  if (value === null) return { NULL: true };
  if (typeof value === 'string') return { S: value };
  if (typeof value === 'number') return { N: String(value) };
  if (typeof value === 'boolean') return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(marshallValue) };
  if (typeof value === 'object') return { M: marshall(value) };
  throw new TypeError(`Unsupported DynamoDB type: ${typeof value}`);
}

export function marshall(item = {}, schema = {}) {
  return Object.fromEntries(
    Object.entries(item).map(([key, value]) => [key, marshallValue(value, schema[key])]),
  );
}
