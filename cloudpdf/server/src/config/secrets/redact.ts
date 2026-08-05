/**
 * Walk a config tree and replace any `SecretRef`-shaped objects with a
 * stable, log-safe placeholder. Used by status endpoints, debug
 * loggers, and config printers — anything that may emit configs to
 * non-secure output channels (logs, `/v1/admin/status`, support
 * tickets, etc.).
 *
 * SecretRef-shape detection is structural: an object that has both
 * `provider` and `name` string fields is treated as a SecretRef and
 * replaced with `<SecretRef ${provider}/${name}>`.
 *
 * The SecretRef itself never contains the secret VALUE — only a
 * pointer to where the value lives. The placeholder preserves enough
 * info for an operator to identify which secret was referenced
 * (without exposing it as raw config that could accidentally leak
 * downstream).
 *
 * For fields that hold LITERAL secret values (e.g., a Bunny zoneToken
 * passed as a plain string for local-dev), callers pass
 * `additionalSensitiveKeys` to redact those fields by key name
 * regardless of value shape.
 */

export interface RedactOptions {
  /**
   * Field names whose values should be redacted regardless of shape.
   * Useful for literal-string secret values that can't be detected
   * structurally. Example: `['zoneToken', 'privateKeyPem', 'kek']`.
   */
  readonly additionalSensitiveKeys?: ReadonlyArray<string>;
}

export function redactConfig(config: unknown, opts: RedactOptions = {}): unknown {
  const sensitive = new Set(opts.additionalSensitiveKeys ?? []);
  return walk(config, sensitive);
}

/**
 * Type guard for SecretRef-shaped values. Matches the structural
 * definition (object with `provider` and `name` string fields). The
 * Zod `SecretRefSchema` produces values that pass this guard.
 */
export function isSecretRefShape(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.provider === 'string' && typeof obj.name === 'string';
}

function walk(value: unknown, sensitive: ReadonlySet<string>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => walk(v, sensitive));

  const obj = value as Record<string, unknown>;
  if (isSecretRefShape(obj)) {
    return `<SecretRef ${obj.provider as string}/${obj.name as string}>`;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (sensitive.has(k) && typeof v === 'string') {
      out[k] = '<redacted>';
    } else {
      out[k] = walk(v, sensitive);
    }
  }
  return out;
}
