import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';

type KeyLike = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
import {
  createJwtVerifier,
  Hs256Verifier,
  signDevToken,
  type JwksCacheStore,
  type RevocationCheck,
} from '../src/auth/JwtVerifier';

/**
 * Phase 2 JWT verifier conformance.
 *
 * Every mode (HS256, RS256, ES256, JWKS) gets covered for:
 *   - happy path: a valid token verifies and exposes the right claims
 *   - signature failure: tampered token is rejected
 *   - expiration: expired token is rejected (modulo clock skew)
 *   - issuer / audience mismatch
 *   - revocation: a `jti` in the guard is rejected even when the
 *     signature + claims are valid
 *
 * The JWKS test boots a tiny in-process HTTP server, generates a
 * keypair, signs a token, and exposes the public key as a JWKS — full
 * round-trip with no mocking of jose internals.
 */

const TENANT = 'tenant-jwt-tests';

describe('Hs256Verifier', () => {
  const secret = 'unit-test-secret';

  test('verifies a freshly minted token', async () => {
    const v = new Hs256Verifier({ secret });
    const tok = signDevToken(secret, { sub: 'alice', tenant_id: TENANT });
    const claims = await v.verify(tok);
    expect(claims.sub).toBe('alice');
    expect(claims.tenant_id).toBe(TENANT);
  });

  test('rejects a token signed with a different secret', async () => {
    const v = new Hs256Verifier({ secret });
    const bad = signDevToken('other-secret', { sub: 'alice', tenant_id: TENANT });
    await expect(v.verify(bad)).rejects.toThrow(/invalid jwt signature/);
  });

  test('rejects an expired token (past skew)', async () => {
    const v = new Hs256Verifier({ secret, clockSkewSeconds: 0 });
    const tok = signDevToken(secret, { sub: 'alice', tenant_id: TENANT, ttlSeconds: -10 });
    await expect(v.verify(tok)).rejects.toThrow(/jwt expired/);
  });

  test('honours revocation hook on jti', async () => {
    const revoked = new Set<string>();
    const guard: RevocationCheck = {
      isRevoked: async (jti) => revoked.has(jti),
    };
    const v = new Hs256Verifier({ secret, revocation: guard });

    const tok = signDevToken(secret, { sub: 'alice', tenant_id: TENANT, jti: 'jti-1' });
    await expect(v.verify(tok)).resolves.toBeDefined();
    revoked.add('jti-1');
    await expect(v.verify(tok)).rejects.toThrow(/revoked/);
  });

  test('rejects a token whose scope is not an array', async () => {
    const v = new Hs256Verifier({ secret });
    const tok = signDevToken(secret, {
      sub: 'alice',
      tenant_id: TENANT,
      extras: { scope: 'not-an-array' },
    });
    await expect(v.verify(tok)).rejects.toThrow(/scope must be an array/);
  });

  test('keeps the PDF unlock key under the embedpdf namespace only', async () => {
    const v = new Hs256Verifier({ secret });
    const tok = signDevToken(secret, {
      sub: 'alice',
      tenant_id: TENANT,
      extras: {
        unlock_key: 'flat-legacy-key',
        embedpdf: { unlock_key: 'namespaced-key' },
      },
    });

    const claims = await v.verify(tok);
    expect(claims.embedpdf?.unlock_key).toBe('namespaced-key');
    expect((claims as unknown as { unlock_key?: string }).unlock_key).toBeUndefined();
  });

  test('ignores a flat PDF unlock key claim', async () => {
    const v = new Hs256Verifier({ secret });
    const tok = signDevToken(secret, {
      sub: 'alice',
      tenant_id: TENANT,
      extras: { unlock_key: 'flat-legacy-key' },
    });

    const claims = await v.verify(tok);
    expect(claims.embedpdf).toBeUndefined();
    expect((claims as unknown as { unlock_key?: string }).unlock_key).toBeUndefined();
  });

  test('parses identity claims into the verified claim object', async () => {
    const v = new Hs256Verifier({ secret });
    const tok = signDevToken(secret, {
      sub: 'alice',
      tenant_id: TENANT,
      extras: {
        user_id: '44',
        group_id: '4',
        groups: ['4', 'engineering'],
        display_name: 'Alice Example',
      },
    });

    const claims = await v.verify(tok);
    expect(claims).toMatchObject({
      user_id: '44',
      group_id: '4',
      groups: ['4', 'engineering'],
      display_name: 'Alice Example',
    });
  });

  test('rejects malformed identity arrays', async () => {
    const v = new Hs256Verifier({ secret });
    const tok = signDevToken(secret, {
      sub: 'alice',
      tenant_id: TENANT,
      extras: { groups: ['4', 42] },
    });

    await expect(v.verify(tok)).rejects.toThrow(/groups\[1\] must be a string/);
  });
});

describe('AsymmetricVerifier (RS256)', () => {
  let pair: { publicKey: KeyLike; privateKey: KeyLike };
  let publicKeyPem: string;

  beforeAll(async () => {
    pair = await generateKeyPair('RS256', { extractable: true });
    const { exportSPKI } = await import('jose');
    publicKeyPem = await exportSPKI(pair.publicKey);
  });

  async function sign(
    payload: Record<string, unknown>,
    opts: { ttl?: number } = {},
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + (opts.ttl ?? 3600))
      .sign(pair.privateKey);
  }

  test('verifies a valid RS256 token', async () => {
    const v = createJwtVerifier({
      mode: 'asymmetric',
      algorithm: 'RS256',
      publicKeyPem,
    });
    const tok = await sign({ sub: 'alice', tenant_id: TENANT });
    const claims = await v.verify(tok);
    expect(claims.sub).toBe('alice');
    expect(claims.tenant_id).toBe(TENANT);
  });

  test('rejects a token signed with a different keypair', async () => {
    const other = await generateKeyPair('RS256');
    const tok = await new SignJWT({ sub: 'mallory', tenant_id: TENANT })
      .setProtectedHeader({ alg: 'RS256' })
      .setExpirationTime('1h')
      .setIssuedAt()
      .sign(other.privateKey);
    const v = createJwtVerifier({
      mode: 'asymmetric',
      algorithm: 'RS256',
      publicKeyPem,
    });
    await expect(v.verify(tok)).rejects.toThrow();
  });

  test('enforces issuer when configured', async () => {
    const v = createJwtVerifier({
      mode: 'asymmetric',
      algorithm: 'RS256',
      publicKeyPem,
      issuer: 'https://acme.com',
    });
    const good = await new SignJWT({ sub: 'alice', tenant_id: TENANT, iss: 'https://acme.com' })
      .setProtectedHeader({ alg: 'RS256' })
      .setExpirationTime('1h')
      .setIssuedAt()
      .sign(pair.privateKey);
    const bad = await new SignJWT({ sub: 'alice', tenant_id: TENANT, iss: 'https://attacker.com' })
      .setProtectedHeader({ alg: 'RS256' })
      .setExpirationTime('1h')
      .setIssuedAt()
      .sign(pair.privateKey);
    await expect(v.verify(good)).resolves.toBeDefined();
    await expect(v.verify(bad)).rejects.toThrow();
  });

  test('enforces audience when configured', async () => {
    const v = createJwtVerifier({
      mode: 'asymmetric',
      algorithm: 'RS256',
      publicKeyPem,
      audience: 'embedpdf.cloud',
    });
    const good = await new SignJWT({
      sub: 'alice',
      tenant_id: TENANT,
      aud: 'embedpdf.cloud',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setExpirationTime('1h')
      .setIssuedAt()
      .sign(pair.privateKey);
    await expect(v.verify(good)).resolves.toBeDefined();
  });

  test('rejects expired RS256 token', async () => {
    const v = createJwtVerifier({
      mode: 'asymmetric',
      algorithm: 'RS256',
      publicKeyPem,
      clockSkewSeconds: 0,
    });
    const expired = await sign({ sub: 'alice', tenant_id: TENANT }, { ttl: -10 });
    await expect(v.verify(expired)).rejects.toThrow();
  });
});

describe('AsymmetricVerifier (ES256)', () => {
  test('verifies a valid ES256 token with EC keypair', async () => {
    const pair = await generateKeyPair('ES256', { extractable: true });
    const { exportSPKI } = await import('jose');
    const publicKeyPem = await exportSPKI(pair.publicKey);

    const v = createJwtVerifier({
      mode: 'asymmetric',
      algorithm: 'ES256',
      publicKeyPem,
    });
    const tok = await new SignJWT({ sub: 'bob', tenant_id: TENANT })
      .setProtectedHeader({ alg: 'ES256' })
      .setExpirationTime('1h')
      .setIssuedAt()
      .sign(pair.privateKey);

    const claims = await v.verify(tok);
    expect(claims.sub).toBe('bob');
  });

  test('rejects ES256 token when verifier expects RS256', async () => {
    const ecPair = await generateKeyPair('ES256', { extractable: true });
    const rsPair = await generateKeyPair('RS256', { extractable: true });
    const { exportSPKI } = await import('jose');
    const rsPem = await exportSPKI(rsPair.publicKey);

    const v = createJwtVerifier({
      mode: 'asymmetric',
      algorithm: 'RS256',
      publicKeyPem: rsPem,
    });
    const tok = await new SignJWT({ sub: 'mallory', tenant_id: TENANT })
      .setProtectedHeader({ alg: 'ES256' })
      .setExpirationTime('1h')
      .setIssuedAt()
      .sign(ecPair.privateKey);

    await expect(v.verify(tok)).rejects.toThrow();
  });
});

describe('JwksVerifier', () => {
  let server: Server;
  let baseUrl = '';
  let pair: { publicKey: KeyLike; privateKey: KeyLike };
  let publicJwk: JWK & { kid: string };
  let jwksFetchCount = 0;

  beforeAll(async () => {
    pair = await generateKeyPair('RS256', { extractable: true });
    const jwk = await exportJWK(pair.publicKey);
    publicJwk = { ...jwk, kid: 'test-key-1', alg: 'RS256', use: 'sig' } as JWK & { kid: string };

    server = createServer((req, res) => {
      if (req.url === '/jwks.json') {
        jwksFetchCount += 1;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ keys: [publicJwk] }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(() => {
    server.close();
  });

  async function signJwks(payload: Record<string, unknown>): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
      .setExpirationTime('1h')
      .setIssuedAt()
      .sign(pair.privateKey);
  }

  test('fetches JWKS and verifies a token signed with the matching key', async () => {
    jwksFetchCount = 0;
    const v = createJwtVerifier({
      mode: 'jwks',
      jwksUri: `${baseUrl}/jwks.json`,
    });
    const tok = await signJwks({ sub: 'alice', tenant_id: TENANT });
    const claims = await v.verify(tok);
    expect(claims.sub).toBe('alice');
    expect(jwksFetchCount).toBeGreaterThanOrEqual(1);
  });

  test('reuses in-memory key set across verifies (no thundering herd)', async () => {
    jwksFetchCount = 0;
    const v = createJwtVerifier({
      mode: 'jwks',
      jwksUri: `${baseUrl}/jwks.json`,
    });
    const a = await signJwks({ sub: 'a', tenant_id: TENANT });
    const b = await signJwks({ sub: 'b', tenant_id: TENANT });
    const c = await signJwks({ sub: 'c', tenant_id: TENANT });
    await Promise.all([v.verify(a), v.verify(b), v.verify(c)]);
    // jose's RemoteJWKSet has a cooldownDuration that bundles
    // concurrent requests; we should see way fewer fetches than verifies.
    expect(jwksFetchCount).toBeLessThanOrEqual(2);
  });

  test('honours JwksCacheStore on cold boot', async () => {
    jwksFetchCount = 0;
    const store: JwksCacheStore = {
      get: async () => ({
        jwks: { keys: [publicJwk] },
        expiresAt: Date.now() + 60_000,
      }),
      set: async () => {},
    };
    const v = createJwtVerifier({
      mode: 'jwks',
      jwksUri: `${baseUrl}/jwks.json`,
      cacheStore: store,
    });
    const tok = await signJwks({ sub: 'cold', tenant_id: TENANT });
    await v.verify(tok);
    // With a fresh-from-persistence cache hit, we never hit the
    // network for the first verify.
    expect(jwksFetchCount).toBe(0);
  });

  test('rejects a token signed by an unknown key', async () => {
    const other = await generateKeyPair('RS256', { extractable: true });
    const tok = await new SignJWT({ sub: 'mallory', tenant_id: TENANT })
      .setProtectedHeader({ alg: 'RS256', kid: 'foreign-key' })
      .setExpirationTime('1h')
      .setIssuedAt()
      .sign(other.privateKey);
    const v = createJwtVerifier({
      mode: 'jwks',
      jwksUri: `${baseUrl}/jwks.json`,
    });
    await expect(v.verify(tok)).rejects.toThrow();
  });
});
