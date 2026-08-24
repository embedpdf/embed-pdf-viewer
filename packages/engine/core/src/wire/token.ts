export type TokenScalar = string | number | boolean;
export type TokenInput = Record<string, TokenScalar | undefined>;
export type TokenQuery = Record<string, string>;

export interface TokenSchema {
  /**
   * Allowed field names. Field names are dotted paths of camelCase segments
   * (e.g. `viewport.kind`, `target.rect.left`). `=` is reserved as the
   * key/value delimiter and `,` as the pair separator, so neither may appear
   * in field names. `.` is the path separator that lets dotted keys round-
   * trip generically through `flatten`/`unflatten`.
   *
   * The token form is intentionally isomorphic to a query string: swap `,`
   * for `&` and you have a query string with identical keys and values.
   * Both `=` and `,` are RFC 3986 sub-delims, allowed unencoded in path
   * segments, so the token never needs URL-encoding for its grammar.
   */
  fields: readonly string[];
  maxLength?: number;
}

const DEFAULT_MAX_TOKEN_LENGTH = 256;
// One or more camelCase segments joined by `.`. Each segment must start with
// a letter and contain only [A-Za-z0-9]. Reserved characters `=` and `,` are
// excluded by construction so the codec can parse without escape handling.
const FIELD_NAME_RE = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/;
const VALUE_RE = /^[A-Za-z0-9.-]+$/;

export function encodeToken(schema: TokenSchema, input: TokenInput): string {
  assertSchema(schema);
  const allowed = new Set(schema.fields);
  const pairs: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    assertKnownField(allowed, key);
    const encoded = encodeScalar(key, value);
    assertSafeValue(key, encoded);
    pairs.push([key, encoded]);
  }

  pairs.sort(([a], [b]) => a.localeCompare(b));
  const token = pairs.map(([key, value]) => `${key}=${value}`).join(',');
  if (token.length === 0) throw new Error('token must not be empty');
  assertTokenLength(schema, token);
  return token;
}

export function decodeToken(schema: TokenSchema, raw: string): TokenQuery {
  assertSchema(schema);
  const token = raw.startsWith('@') ? raw.slice(1) : raw;
  assertTokenLength(schema, token);
  if (token.length === 0) throw new Error('token must not be empty');

  const allowed = new Set(schema.fields);
  const output: TokenQuery = {};
  let previousKey: string | undefined;

  for (const pair of token.split(',')) {
    if (pair.length === 0) throw new Error('token contains an empty field');
    const separator = pair.indexOf('=');
    if (separator <= 0 || separator === pair.length - 1) {
      throw new Error(`token field "${pair}" must be key=value`);
    }

    const key = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    assertKnownField(allowed, key);
    assertSafeValue(key, value);
    if (output[key] !== undefined) throw new Error(`token field "${key}" appears more than once`);
    if (previousKey !== undefined && key.localeCompare(previousKey) <= 0) {
      throw new Error('token fields must be in alphabetical order');
    }
    previousKey = key;
    output[key] = value;
  }

  return output;
}

function assertSchema(schema: TokenSchema): void {
  for (const field of schema.fields) {
    if (!FIELD_NAME_RE.test(field)) {
      throw new Error(`token field name "${field}" must be camelCase segments joined by "."`);
    }
  }
}

function assertKnownField(allowed: Set<string>, key: string): void {
  if (!allowed.has(key)) throw new Error(`unknown token field "${key}"`);
}

function encodeScalar(key: string, value: TokenScalar): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`token field "${key}" must be finite`);
    return Number.isInteger(value) ? String(value) : trimDecimal(value);
  }
  return value;
}

function trimDecimal(value: number): string {
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function assertSafeValue(key: string, value: string): void {
  if (!VALUE_RE.test(value)) {
    throw new Error(`token field "${key}" value contains a reserved character`);
  }
}

function assertTokenLength(schema: TokenSchema, token: string): void {
  const maxLength = schema.maxLength ?? DEFAULT_MAX_TOKEN_LENGTH;
  if (token.length > maxLength) {
    throw new Error(`token exceeds ${maxLength} characters`);
  }
}
