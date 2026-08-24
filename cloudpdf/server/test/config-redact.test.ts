import { describe, expect, it } from 'vitest';
import { isSecretRefShape, redactConfig } from '../src/config/secrets/redact';

describe('redactConfig', () => {
  it('replaces a SecretRef-shaped object with a placeholder', () => {
    const out = redactConfig({
      provider: 'awsProd',
      name: 'embedpdf/prod/kek',
      encoding: 'base64',
    });
    expect(out).toBe('<SecretRef awsProd/embedpdf/prod/kek>');
  });

  it('replaces nested SecretRefs while preserving surrounding shape', () => {
    const config = {
      kind: 'static',
      keyId: 'prod-kek',
      kek: { provider: 'awsProd', name: 'embedpdf/kek', encoding: 'base64' },
    };
    const out = redactConfig(config);
    expect(out).toEqual({
      kind: 'static',
      keyId: 'prod-kek',
      kek: '<SecretRef awsProd/embedpdf/kek>',
    });
  });

  it('walks arrays', () => {
    const config = {
      refs: [
        { provider: 'env', name: 'A' },
        { provider: 'file', name: 'B' },
      ],
    };
    expect(redactConfig(config)).toEqual({
      refs: ['<SecretRef env/A>', '<SecretRef file/B>'],
    });
  });

  it('leaves non-secret fields untouched', () => {
    const config = {
      kind: 's3',
      bucket: 'embedpdf-prod',
      region: 'us-east-1',
      endpoint: 'https://s3.example.com',
    };
    expect(redactConfig(config)).toEqual(config);
  });

  it('redacts additionalSensitiveKeys by name regardless of shape', () => {
    const config = {
      kind: 'bunny',
      zoneHostname: 'embedpdf.b-cdn.net',
      zoneToken: 'literal-token-value-for-dev', // ← plain string, not a SecretRef
    };
    const out = redactConfig(config, { additionalSensitiveKeys: ['zoneToken'] });
    expect(out).toEqual({
      kind: 'bunny',
      zoneHostname: 'embedpdf.b-cdn.net',
      zoneToken: '<redacted>',
    });
  });

  it('NEVER leaks the original SecretRef value in stringified output', () => {
    // The smoking-gun assertion: no part of any secret reference's
    // name or provider should appear verbatim in the JSON output
    // (only inside our intentional placeholder, which is fine because
    // the placeholder shape is the contract).
    const config = {
      kms: {
        kind: 'static',
        kek: { provider: 'awsProd', name: 'top/secret/path/that/must/not/leak' },
      },
      cdn: {
        kind: 'cloudfront',
        privateKeyPem: { provider: 'azureKv', name: 'cloudfront-rsa-key' },
      },
    };
    const json = JSON.stringify(redactConfig(config));

    // The placeholder MAY contain the names — that's the contract.
    // But the original SecretRef object shape (`{ "provider": "..." }`)
    // MUST NOT appear in the output.
    expect(json).not.toContain('"provider":"awsProd"');
    expect(json).not.toContain('"provider":"azureKv"');
    expect(json).not.toMatch(/"name":"top\/secret/);
  });

  it('leaves primitives unchanged', () => {
    expect(redactConfig(42)).toBe(42);
    expect(redactConfig('hello')).toBe('hello');
    expect(redactConfig(null)).toBe(null);
    expect(redactConfig(undefined)).toBe(undefined);
    expect(redactConfig(true)).toBe(true);
  });

  it('handles deeply nested structures', () => {
    const config = {
      a: { b: { c: { ref: { provider: 'p', name: 'n' } } } },
    };
    expect(redactConfig(config)).toEqual({
      a: { b: { c: { ref: '<SecretRef p/n>' } } },
    });
  });
});

describe('isSecretRefShape', () => {
  it('returns true for SecretRef-shaped objects', () => {
    expect(isSecretRefShape({ provider: 'env', name: 'X' })).toBe(true);
    expect(isSecretRefShape({ provider: 'aws-sm', name: 'X', encoding: 'base64' })).toBe(true);
  });

  it('returns false when provider or name is missing', () => {
    expect(isSecretRefShape({ provider: 'env' })).toBe(false);
    expect(isSecretRefShape({ name: 'X' })).toBe(false);
    expect(isSecretRefShape({})).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isSecretRefShape(null)).toBe(false);
    expect(isSecretRefShape('string')).toBe(false);
    expect(isSecretRefShape(42)).toBe(false);
    expect(isSecretRefShape([])).toBe(false);
  });

  it('returns false when provider or name are not strings', () => {
    expect(isSecretRefShape({ provider: 123, name: 'X' })).toBe(false);
    expect(isSecretRefShape({ provider: 'env', name: null })).toBe(false);
  });
});
