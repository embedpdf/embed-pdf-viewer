import { describe, expect, test } from 'vitest';
import { matchesOrigin } from '../src/auth/origins';
import { createJwtVerifier, signDevToken } from '../src/auth/JwtVerifier';
import { hashSharePassword, verifySharePassword } from '../src/auth/share-password';

describe('matchesOrigin', () => {
  test('exact origins: scheme, host, and port must all agree', () => {
    expect(matchesOrigin('https://acme.com', ['https://acme.com'])).toBe(true);
    expect(matchesOrigin('https://ACME.com', ['https://acme.com'])).toBe(true);
    expect(matchesOrigin('http://acme.com', ['https://acme.com'])).toBe(false);
    expect(matchesOrigin('https://acme.com:8443', ['https://acme.com'])).toBe(false);
    expect(matchesOrigin('https://acme.com', ['https://acme.com:443'])).toBe(true);
    expect(matchesOrigin('http://localhost:3000', ['http://localhost:3000'])).toBe(true);
    expect(matchesOrigin('https://acme.org', ['https://acme.com', 'https://acme.org'])).toBe(true);
  });

  test('wildcard matches one or more subdomain labels, never the apex', () => {
    expect(matchesOrigin('https://docs.acme.com', ['https://*.acme.com'])).toBe(true);
    expect(matchesOrigin('https://a.b.acme.com', ['https://*.acme.com'])).toBe(true);
    expect(matchesOrigin('https://acme.com', ['https://*.acme.com'])).toBe(false);
    expect(matchesOrigin('https://evilacme.com', ['https://*.acme.com'])).toBe(false);
    expect(matchesOrigin('https://docs.acme.com.evil.io', ['https://*.acme.com'])).toBe(false);
  });

  test('malformed inputs fail closed', () => {
    expect(matchesOrigin('not-an-origin', ['https://acme.com'])).toBe(false);
    expect(matchesOrigin('https://acme.com/path', ['https://acme.com'])).toBe(false);
    expect(matchesOrigin('null', ['https://acme.com'])).toBe(false);
    expect(matchesOrigin('https://acme.com', ['garbage'])).toBe(false);
    expect(matchesOrigin('https://acme.com', [])).toBe(false);
  });
});

describe('origins claim discipline', () => {
  const SECRET = 'origins-claim-secret';
  const verifier = createJwtVerifier({ mode: 'hs256', secret: SECRET });

  test('doc tokens carry origins; verification preserves them', async () => {
    const token = signDevToken(SECRET, {
      sub: 'u1',
      tenant_id: 't1',
      doc_id: 'd1',
      scope: ['doc.open'],
      origins: ['https://acme.com'],
    });
    const claims = await verifier.verify(token);
    expect((claims as { origins?: string[] }).origins).toEqual(['https://acme.com']);
  });

  test('origins on a tenant token rejects the JWT — tenant tokens never reach browsers', async () => {
    // signDevToken refuses to mint it…
    expect(() =>
      signDevToken(SECRET, { sub: 'u1', tenant_id: 't1', scope: ['docs.read'], origins: ['https://a.com'] }),
    ).toThrow(/origins requires doc_id/);
    // …and a hand-crafted one fails verification.
    const forged = signDevToken(SECRET, {
      sub: 'u1',
      tenant_id: 't1',
      scope: ['docs.read'],
      extras: { origins: ['https://a.com'] },
    });
    await expect(verifier.verify(forged)).rejects.toThrow(/origins requires doc_id/);
  });

  test('empty or non-string origins arrays reject the JWT', async () => {
    const empty = signDevToken(SECRET, {
      sub: 'u1',
      tenant_id: 't1',
      doc_id: 'd1',
      scope: ['doc.open'],
      extras: { origins: [] },
    });
    await expect(verifier.verify(empty)).rejects.toThrow(/non-empty/);
  });
});

describe('share passwords', () => {
  test('round-trips and rejects, constant-shape envelope', () => {
    const envelope = hashSharePassword('q3-review');
    expect(envelope.startsWith('scrypt$')).toBe(true);
    expect(verifySharePassword('q3-review', envelope)).toBe(true);
    expect(verifySharePassword('Q3-review', envelope)).toBe(false);
    expect(verifySharePassword('', envelope)).toBe(false);
  });

  test('two hashes of the same phrase differ (per-grant salt)', () => {
    expect(hashSharePassword('same')).not.toBe(hashSharePassword('same'));
  });

  test('malformed envelopes never match', () => {
    expect(verifySharePassword('x', 'not-an-envelope')).toBe(false);
    expect(verifySharePassword('x', 'scrypt$a$b$c$d$e')).toBe(false);
    expect(verifySharePassword('x', 'scrypt$16384$8$1$$')).toBe(false);
  });
});
