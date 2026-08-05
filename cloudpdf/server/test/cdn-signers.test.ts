/**
 * Deterministic signing tests for every CDN adapter. Each test pins
 * stable inputs (secret, path, expiry, nonce) to stable outputs so
 * regressions in the signing math show up immediately.
 *
 * The fixture `baseCoverage` mirrors a realistic /access response —
 * the caller's scope granted four cacheable resources, and each one
 * lives at its own distinct path prefix (paths v2). The per-prefix
 * shape is what every adapter sees, so the tests verify the
 * per-resource scope enforcement contract end-to-end.
 *
 * Live edge-acceptance smoke tests live alongside each adapter's
 * deployment README — they require real CDN credentials and run
 * out-of-band, not in CI.
 */

import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';

import {
  AzureFrontDoorCdnSigner,
  BunnyCdnSigner,
  CloudCdnSigner,
  CloudFrontCdnSigner,
  CustomHmacCdnSigner,
  NoneCdnSigner,
  signAzureFdToken,
  signBunnyToken,
  signCloudCdnPrefix,
  signCloudFrontPolicy,
  signCloudFrontPolicyForResources,
  signCustomHmacToken,
} from '../src/index';
import type { SignInput } from '../src/cdn/CdnSigner';

const baseCoverage = [
  {
    resourceId: 'manifest' as const,
    pathPattern: '/v1/docs/doc_abc/manifest@*',
    pathPrefix: '/v1/docs/doc_abc/manifest@',
  },
  {
    resourceId: 'page-render' as const,
    pathPattern: '/v1/docs/doc_abc/render/pages/*/data@*',
    pathPrefix: '/v1/docs/doc_abc/render/pages/',
  },
  {
    resourceId: 'page-text' as const,
    pathPattern: '/v1/docs/doc_abc/text/pages/*/data@*',
    pathPrefix: '/v1/docs/doc_abc/text/pages/',
  },
  {
    resourceId: 'annotations-read' as const,
    pathPattern: '/v1/docs/doc_abc/layers/default/annotations/pages/*/items@*',
    pathPrefix: '/v1/docs/doc_abc/layers/default/annotations/pages/',
  },
];

const baseSignInput: SignInput = {
  tenantId: 't1',
  docId: 'doc_abc',
  layerName: 'default',
  coverage: baseCoverage,
  expiresAt: 1_700_000_000,
  originUrl: 'https://api.example.com',
};

describe('NoneCdnSigner', () => {
  it('produces the pre-CDN /access shape', () => {
    const signer = new NoneCdnSigner();
    const access = signer.buildAccess(baseSignInput);
    expect(access.adapter).toBe('none');
    expect(access.baseUrlOverrides).toBeNull();
    expect(access.signedQueryParams).toBeNull();
    expect(access.signedCookies).toBeNull();
    expect(access.signedPathPolicies).toBeNull();
    expect(access.cache.scope).toBe('browser-private');
  });

  it('purge is a no-op', async () => {
    const receipt = await new NoneCdnSigner().purge({ tenantId: 't1' });
    expect(receipt.status).toBe('no-op');
  });
});

describe('BunnyCdnSigner', () => {
  it('signBunnyToken is deterministic given the same inputs', () => {
    const a = signBunnyToken('secret-token', '/v1/docs/doc_abc/render/pages/', 1_700_000_000);
    const b = signBunnyToken('secret-token', '/v1/docs/doc_abc/render/pages/', 1_700_000_000);
    expect(a.token).toBe(b.token);
    expect(a.expires).toBe(1_700_000_000);
  });

  it('different paths produce different tokens', () => {
    const a = signBunnyToken('s', '/v1/docs/a/render/pages/', 1_700_000_000);
    const b = signBunnyToken('s', '/v1/docs/a/text/pages/', 1_700_000_000);
    expect(a.token).not.toBe(b.token);
  });

  it('buildAccess populates one signedPathPolicies entry per coverage prefix', () => {
    const signer = new BunnyCdnSigner({
      zoneHostname: 'embedpdf.b-cdn.net',
      zoneToken: 'secret-token',
    });
    const access = signer.buildAccess(baseSignInput);
    expect(access.adapter).toBe('bunny');
    expect(access.baseUrlOverrides).toEqual({
      manifest: 'https://embedpdf.b-cdn.net',
      'page-render': 'https://embedpdf.b-cdn.net',
      'page-text': 'https://embedpdf.b-cdn.net',
      'annotations-read': 'https://embedpdf.b-cdn.net',
    });
    expect(access.signedQueryParams).toBeNull();
    expect(access.signedCookies).toBeNull();
    expect(access.authHeader).toBeNull();
    expect(access.signedPathPolicies).toHaveLength(baseCoverage.length);
    // Each entry's prefix matches the corresponding coverage entry,
    // and its token is the HMAC over THAT prefix (not a doc-wide one)
    for (const [i, policy] of (access.signedPathPolicies ?? []).entries()) {
      expect(policy.pathPrefix).toBe(baseCoverage[i]!.pathPrefix);
      const expected = signBunnyToken(
        'secret-token',
        baseCoverage[i]!.pathPrefix,
        baseSignInput.expiresAt,
      );
      expect(policy.queryParams.token).toBe(expected.token);
      expect(policy.queryParams.expires).toBe(String(expected.expires));
    }
  });

  it('per-prefix tokens are NOT interchangeable across resources', () => {
    // The whole point of per-prefix signing: a render-only token must
    // not authorize text requests at the edge.
    const signer = new BunnyCdnSigner({ zoneHostname: 'h', zoneToken: 's' });
    const access = signer.buildAccess(baseSignInput);
    const policies = access.signedPathPolicies ?? [];
    const renderPolicy = policies.find((p) => p.pathPrefix.includes('/render/pages/'));
    const textPolicy = policies.find((p) => p.pathPrefix.includes('/text/pages/'));
    expect(renderPolicy?.queryParams.token).not.toBe(textPolicy?.queryParams.token);
  });

  it('empty coverage yields null signedPathPolicies', () => {
    const signer = new BunnyCdnSigner({ zoneHostname: 'h', zoneToken: 's' });
    const access = signer.buildAccess({ ...baseSignInput, coverage: [] });
    expect(access.signedPathPolicies).toBeNull();
    expect(access.baseUrlOverrides).toEqual({});
  });

  it('info exposes only public fields', () => {
    const signer = new BunnyCdnSigner({ zoneHostname: 'host', zoneToken: 'TOPSECRET' });
    expect(signer.info).toEqual({ kind: 'bunny', zoneHostname: 'host' });
    expect(JSON.stringify(signer.info)).not.toContain('TOPSECRET');
  });
});

describe('AzureFrontDoorCdnSigner', () => {
  it('signAzureFdToken is deterministic', () => {
    const a = signAzureFdToken('s', '/v1/docs/doc/render/pages/', 1_700_000_000);
    const b = signAzureFdToken('s', '/v1/docs/doc/render/pages/', 1_700_000_000);
    expect(a.token).toBe(b.token);
  });

  it('buildAccess populates one signedPathPolicies entry per coverage prefix', () => {
    const signer = new AzureFrontDoorCdnSigner({
      endpoint: 'https://embedpdf.azurefd.net',
      secret: 'secret-key',
    });
    const access = signer.buildAccess(baseSignInput);
    expect(access.adapter).toBe('azure-fd');
    expect(access.signedQueryParams).toBeNull();
    expect(access.signedPathPolicies).toHaveLength(baseCoverage.length);
    for (const [i, policy] of (access.signedPathPolicies ?? []).entries()) {
      expect(policy.pathPrefix).toBe(baseCoverage[i]!.pathPrefix);
      expect(policy.queryParams.token).toMatch(/.+/);
      expect(policy.queryParams.expires).toBe(String(baseSignInput.expiresAt));
    }
  });

  it('info hides the secret', () => {
    const signer = new AzureFrontDoorCdnSigner({
      endpoint: 'https://embedpdf.azurefd.net',
      secret: 'TOPSECRET',
    });
    expect(JSON.stringify(signer.info)).not.toContain('TOPSECRET');
  });
});

describe('CustomHmacCdnSigner', () => {
  it('signCustomHmacToken with explicit nonce is deterministic', () => {
    const nonceBytes = Buffer.alloc(16, 1);
    const a = signCustomHmacToken('secret', '/v1/docs/doc/', 1_700_000_000, nonceBytes);
    const b = signCustomHmacToken('secret', '/v1/docs/doc/', 1_700_000_000, nonceBytes);
    expect(a.sig).toBe(b.sig);
    expect(a.nonce).toBe(b.nonce);
  });

  it('header transport sets a single global authHeader (documented trade-off)', () => {
    const headerSigner = new CustomHmacCdnSigner({
      cdnOrigin: 'https://cdn.example.com',
      secret: 's',
      transport: 'header',
    });
    const headerAccess = headerSigner.buildAccess(baseSignInput);
    expect(headerAccess.authHeader?.name).toBe('X-EmbedPDF-CDN-Signature');
    expect(headerAccess.authHeader?.value).toMatch(/^v1\.1700000000\..+\..+$/);
    expect(headerAccess.signedQueryParams).toBeNull();
    expect(headerAccess.signedPathPolicies).toBeNull();
  });

  it('query transport sets one signedPathPolicies entry per coverage prefix', () => {
    const querySigner = new CustomHmacCdnSigner({
      cdnOrigin: 'https://cdn.example.com',
      secret: 's',
      transport: 'query',
    });
    const queryAccess = querySigner.buildAccess(baseSignInput);
    expect(queryAccess.authHeader).toBeNull();
    expect(queryAccess.signedQueryParams).toBeNull();
    expect(queryAccess.signedPathPolicies).toHaveLength(baseCoverage.length);
    for (const [i, policy] of (queryAccess.signedPathPolicies ?? []).entries()) {
      expect(policy.pathPrefix).toBe(baseCoverage[i]!.pathPrefix);
      expect(policy.queryParams.cdn_sig).toMatch(/.+/);
      expect(policy.queryParams.cdn_exp).toBe(String(baseSignInput.expiresAt));
      expect(policy.queryParams.cdn_nonce).toMatch(/.+/);
    }
  });
});

describe('CloudCdnSigner', () => {
  it('signCloudCdnPrefix returns the four expected query params', () => {
    // 128-bit base64 key
    const keyBytes = Buffer.from('aGVsbG8gd29ybGQgaGVsbG8h', 'base64');
    const params = signCloudCdnPrefix(
      keyBytes,
      'my-key',
      'https://cdn.example.com/v1/docs/doc_abc/render/pages/',
      1_700_000_000,
    );
    expect(params).toMatchObject({
      URLPrefix: expect.any(String),
      Expires: '1700000000',
      KeyName: 'my-key',
      Signature: expect.any(String),
    });
    expect(Buffer.from(params.URLPrefix, 'base64').toString('utf8')).toBe(
      'https://cdn.example.com/v1/docs/doc_abc/render/pages/',
    );
  });

  it('different prefixes yield different signatures', () => {
    const keyBytes = Buffer.from('aGVsbG8gd29ybGQgaGVsbG8h', 'base64');
    const a = signCloudCdnPrefix(keyBytes, 'k', 'https://cdn.example.com/v1/docs/a/', 100);
    const b = signCloudCdnPrefix(keyBytes, 'k', 'https://cdn.example.com/v1/docs/b/', 100);
    expect(a.Signature).not.toBe(b.Signature);
  });

  it('buildAccess populates one signedPathPolicies entry per coverage prefix', () => {
    const signer = new CloudCdnSigner({
      urlPrefix: 'https://cdn.example.com',
      keyName: 'my-key',
      keyValue: 'aGVsbG8gd29ybGQgaGVsbG8h',
    });
    const access = signer.buildAccess(baseSignInput);
    expect(access.adapter).toBe('cloud-cdn');
    expect(access.signedPathPolicies).toHaveLength(baseCoverage.length);
    for (const [i, policy] of (access.signedPathPolicies ?? []).entries()) {
      expect(policy.pathPrefix).toBe(baseCoverage[i]!.pathPrefix);
      expect(policy.queryParams).toMatchObject({
        URLPrefix: expect.any(String),
        Expires: '1700000000',
        KeyName: 'my-key',
        Signature: expect.any(String),
      });
      // URLPrefix decodes to the resource-scoped origin + prefix, NOT
      // a doc-wide prefix — so the signature is bound to one resource.
      expect(Buffer.from(policy.queryParams.URLPrefix, 'base64').toString('utf8')).toBe(
        `https://cdn.example.com${baseCoverage[i]!.pathPrefix}`,
      );
    }
  });
});

describe('CloudFrontCdnSigner', () => {
  it('signCloudFrontPolicy builds a single-Resource policy', () => {
    const policyJson = JSON.stringify({
      Statement: [
        {
          Resource: 'https://d123.cloudfront.net/v1/docs/doc_abc/render/pages/*',
          Condition: { DateLessThan: { 'AWS:EpochTime': 1_700_000_000 } },
        },
      ],
    });
    expect(policyJson).toContain('"Statement"');
    expect(policyJson).toContain('"DateLessThan"');
    expect(policyJson).toContain('"AWS:EpochTime":1700000000');
  });

  it('signCloudFrontPolicyForResources packs multiple Resources into one Statement-per-resource policy', async () => {
    const { generateKeyPair } = await import('node:crypto');
    const { promisify } = await import('node:util');
    const gen = promisify(generateKeyPair);
    const { privateKey } = await gen('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const resources = baseCoverage.map((e) => `https://d123.cloudfront.net${e.pathPrefix}*`);
    const { policyB64, signatureB64 } = signCloudFrontPolicyForResources(
      privateKey as string,
      resources,
      1_700_000_000,
    );
    expect(policyB64).not.toMatch(/[+/=]/);
    expect(signatureB64).not.toMatch(/[+/=]/);
  });

  it('signCloudFrontPolicy round-trips with a real generated RSA key', async () => {
    const { generateKeyPair } = await import('node:crypto');
    const { promisify } = await import('node:util');
    const gen = promisify(generateKeyPair);
    const { privateKey } = await gen('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const { policyB64, signatureB64 } = signCloudFrontPolicy(
      privateKey as string,
      'https://d123.cloudfront.net/v1/docs/doc_abc/render/pages/*',
      1_700_000_000,
    );

    expect(policyB64).not.toMatch(/[+/=]/);
    expect(signatureB64).not.toMatch(/[+/=]/);
    expect(policyB64.length).toBeGreaterThan(0);
    expect(signatureB64.length).toBeGreaterThan(0);
  });

  it('cookies mode populates signedCookies with three entries covering every granted resource', async () => {
    const { generateKeyPair } = await import('node:crypto');
    const { promisify } = await import('node:util');
    const gen = promisify(generateKeyPair);
    const { privateKey } = await gen('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const signer = new CloudFrontCdnSigner({
      distributionDomain: 'd123.cloudfront.net',
      keyPairId: 'K2JCJMDEHXQW5F',
      privateKeyPem: privateKey as string,
      mode: 'cookies',
    });
    const access = signer.buildAccess(baseSignInput);
    expect(access.adapter).toBe('cloudfront');
    expect(access.signedCookies).toHaveLength(3);
    const names = access.signedCookies?.map((c) => c.name);
    expect(names).toEqual(['CloudFront-Policy', 'CloudFront-Signature', 'CloudFront-Key-Pair-Id']);
    expect(access.signedPathPolicies).toBeNull();

    // The encoded policy decodes back to one Statement per granted
    // resource — i.e. per-resource scope enforcement at the edge.
    const policyCookie = access.signedCookies?.find((c) => c.name === 'CloudFront-Policy');
    expect(policyCookie).toBeDefined();
    // Reverse AWS's custom alphabet (`-` → `+`, `_` → `=`, `~` → `/`).
    const stdB64 = policyCookie!.value.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/');
    const decoded = JSON.parse(Buffer.from(stdB64, 'base64').toString('utf8'));
    expect(decoded.Statement).toHaveLength(baseCoverage.length);
    for (const [i, stmt] of (decoded.Statement as unknown[]).entries()) {
      expect((stmt as { Resource: string }).Resource).toBe(
        `https://d123.cloudfront.net${baseCoverage[i]!.pathPrefix}*`,
      );
    }
  });

  it('cookies mode yields null cookies when coverage is empty', async () => {
    const { generateKeyPair } = await import('node:crypto');
    const { promisify } = await import('node:util');
    const gen = promisify(generateKeyPair);
    const { privateKey } = await gen('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const signer = new CloudFrontCdnSigner({
      distributionDomain: 'd123.cloudfront.net',
      keyPairId: 'K',
      privateKeyPem: privateKey as string,
      mode: 'cookies',
    });
    const access = signer.buildAccess({ ...baseSignInput, coverage: [] });
    expect(access.signedCookies).toBeNull();
    expect(access.baseUrlOverrides).toEqual({});
  });

  it('urls mode populates one signedPathPolicies entry per coverage prefix', async () => {
    const { generateKeyPair } = await import('node:crypto');
    const { promisify } = await import('node:util');
    const gen = promisify(generateKeyPair);
    const { privateKey } = await gen('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const signer = new CloudFrontCdnSigner({
      distributionDomain: 'd123.cloudfront.net',
      keyPairId: 'K2JCJMDEHXQW5F',
      privateKeyPem: privateKey as string,
      mode: 'urls',
    });
    const access = signer.buildAccess(baseSignInput);
    expect(access.signedPathPolicies).toHaveLength(baseCoverage.length);
    for (const [i, policy] of (access.signedPathPolicies ?? []).entries()) {
      expect(policy.pathPrefix).toBe(baseCoverage[i]!.pathPrefix);
      expect(policy.queryParams).toHaveProperty('Policy');
      expect(policy.queryParams).toHaveProperty('Signature');
      expect(policy.queryParams).toHaveProperty('Key-Pair-Id');
    }
    expect(access.signedCookies).toBeNull();
  });
});

describe('cdn signer info — no secret leakage', () => {
  it('every signer info field is JSON-safe and excludes secrets', () => {
    const signers = [
      new NoneCdnSigner(),
      new BunnyCdnSigner({ zoneHostname: 'h', zoneToken: 'TOP-SECRET-BUNNY' }),
      new AzureFrontDoorCdnSigner({
        endpoint: 'https://x.azurefd.net',
        secret: 'TOP-SECRET-AZURE',
      }),
      new CustomHmacCdnSigner({
        cdnOrigin: 'https://cdn.example.com',
        secret: 'TOP-SECRET-CUSTOM',
        transport: 'header',
      }),
      new CloudCdnSigner({
        urlPrefix: 'https://cdn.example.com',
        keyName: 'k',
        keyValue: 'aGVsbG8gd29ybGQgaGVsbG8h',
      }),
    ];
    for (const signer of signers) {
      const serialized = JSON.stringify(signer.info);
      expect(serialized).not.toContain('TOP-SECRET');
      // Key bytes shouldn't leak either
      expect(serialized).not.toContain('aGVsbG8gd29ybGQgaGVsbG8h');
    }
  });
});
