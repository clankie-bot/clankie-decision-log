// A small interpreter for the JSON Schema 2020-12 subset this repo's schema uses.
// It refuses any keyword it does not implement, so the schema cannot silently grow
// rules the validator ignores. Swap in a full validator (e.g. Ajv) if the schema
// ever needs more than this.

export interface Issue {
  /** JSON Pointer to the offending value; "" is the document root. */
  path: string;
  message: string;
}

type Schema = Record<string, unknown>;

const SUPPORTED = new Set([
  '$schema', '$id', '$defs', '$ref', 'title', 'description',
  'type', 'const', 'enum', 'required', 'properties', 'additionalProperties',
  'items', 'minLength', 'maxLength', 'pattern', 'minimum', 'format',
]);

const FORMATS: Record<string, (s: string) => boolean> = {
  // RFC 3339 date-time with an explicit offset.
  'date-time': (s) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)),
  uri: (s) => {
    if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(s)) return false;
    try {
      new URL(s);
      return true;
    } catch {
      return false;
    }
  },
};

const pointer = (base: string, key: string | number) =>
  `${base}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function matchesType(v: unknown, t: string): boolean {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
}

/** Throws if the schema uses a keyword this interpreter does not implement. */
export function assertSupported(schema: unknown, at = '#'): void {
  if (typeof schema !== 'object' || schema === null) return;
  const s = schema as Schema;
  for (const key of Object.keys(s)) {
    if (!SUPPORTED.has(key)) throw new Error(`unsupported schema keyword "${key}" at ${at}`);
  }
  for (const [name, sub] of Object.entries((s.$defs as Schema | undefined) ?? {})) assertSupported(sub, `${at}/$defs/${name}`);
  for (const [name, sub] of Object.entries((s.properties as Schema | undefined) ?? {})) assertSupported(sub, `${at}/properties/${name}`);
  if (typeof s.items === 'object') assertSupported(s.items, `${at}/items`);
  if (typeof s.additionalProperties === 'object') assertSupported(s.additionalProperties, `${at}/additionalProperties`);
  if (typeof s.format === 'string' && !(s.format in FORMATS)) throw new Error(`unsupported format "${s.format}" at ${at}`);
}

function resolve(root: Schema, ref: string): Schema {
  if (!ref.startsWith('#/')) throw new Error(`only local $ref is supported: ${ref}`);
  let node: unknown = root;
  for (const part of ref.slice(2).split('/')) node = (node as Schema)[part.replaceAll('~1', '/').replaceAll('~0', '~')];
  if (typeof node !== 'object' || node === null) throw new Error(`unresolved $ref ${ref}`);
  return node as Schema;
}

export function checkSchema(root: Schema, value: unknown): Issue[] {
  const issues: Issue[] = [];
  const walk = (schema: Schema, v: unknown, path: string): void => {
    if (typeof schema.$ref === 'string') return walk(resolve(root, schema.$ref), v, path);
    if ('const' in schema && v !== schema.const) {
      issues.push({ path, message: `must be ${JSON.stringify(schema.const)}` });
      return;
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(v)) {
      issues.push({ path, message: `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}` });
      return;
    }
    if (typeof schema.type === 'string' && !matchesType(v, schema.type)) {
      issues.push({ path, message: `must be ${schema.type}, got ${typeOf(v)}` });
      return;
    }
    if (typeof v === 'string') {
      if (typeof schema.minLength === 'number' && [...v].length < schema.minLength)
        issues.push({ path, message: schema.minLength === 1 ? 'must not be empty' : `must have at least ${schema.minLength} characters` });
      if (typeof schema.maxLength === 'number' && [...v].length > schema.maxLength)
        issues.push({ path, message: `must have at most ${schema.maxLength} characters` });
      if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(v))
        issues.push({ path, message: `must match ${schema.pattern}` });
      if (typeof schema.format === 'string' && !FORMATS[schema.format]!(v))
        issues.push({ path, message: `must be a valid ${schema.format}` });
    }
    if (typeof v === 'number' && typeof schema.minimum === 'number' && v < schema.minimum)
      issues.push({ path, message: `must be >= ${schema.minimum}` });
    if (Array.isArray(v) && typeof schema.items === 'object')
      v.forEach((item, i) => walk(schema.items as Schema, item, pointer(path, i)));
    if (typeOf(v) === 'object') {
      const obj = v as Record<string, unknown>;
      const props = (schema.properties as Record<string, Schema> | undefined) ?? {};
      for (const key of (schema.required as string[] | undefined) ?? [])
        if (!(key in obj)) issues.push({ path: pointer(path, key), message: 'is required' });
      for (const [key, child] of Object.entries(obj)) {
        if (key in props) walk(props[key]!, child, pointer(path, key));
        else if (schema.additionalProperties === false) issues.push({ path: pointer(path, key), message: 'is not an allowed property' });
        else if (typeof schema.additionalProperties === 'object') walk(schema.additionalProperties as Schema, child, pointer(path, key));
      }
    }
  };
  walk(root, value, '');
  return issues;
}
