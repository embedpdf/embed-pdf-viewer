import { describe, expect, test } from 'vitest';

import { OID } from '../src/cms/oids';
import { certificateFromDer } from '../src/cms/parse';
import { checkTimestampToken } from '../src/cms/verify-timestamp';
import {
  buildDetachedCms,
  createTestTimestampAuthority,
  validateChain,
  type RawSigner,
  type TrustPort,
} from '../src/index';
import { validateTimestampAuthority } from '../src/trust';
import {
  createAuthorityRoot,
  createIdentity,
  createTimestampAuthorityIdentity,
  type TestIdentity,
} from './helpers/pki';
import { buildTestToken } from './helpers/tokens';

const digest = new Uint8Array(32).map((_, i) => (i * 5 + 9) & 0xff);
const stamped = { kind: 'digest', digest, algorithm: 'sha256' } as const;
const DAY = 24 * 3600 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);
const same = (left: Uint8Array, right: Uint8Array) =>
  expect(Array.from(left)).toEqual(Array.from(right));

/** A CAdES signature by `signer`, carrying `carried` after the signer's own certificate. */
function signatureBy(signer: TestIdentity, carried: Uint8Array[] = []): Promise<Uint8Array> {
  const key: RawSigner = { ...signer.signer, certificateChain: [signer.certificate, ...carried] };
  return buildDetachedCms({ digest, hash: 'sha256', profile: 'cades-b', signer: key });
}

/** A verified token of `authority`, with the trust verdict for it. */
async function authorityTrust(
  authority: TestIdentity,
  trust: TrustPort | null,
  options: { genTime?: Date; certificates?: Uint8Array[]; at?: Date } = {},
) {
  const genTime = options.genTime ?? new Date();
  const token = await buildTestToken({ digest, authority: authority.signer, genTime });
  const check = await checkTimestampToken({ token, stamped });
  expect(check.verdict).toBe('valid');
  return validateTimestampAuthority({
    token: check.token!,
    certificates: options.certificates?.map(certificateFromDer),
    trust,
    genTime,
    ...(options.at
      ? { at: { kind: 'timestamp', genTime: options.at.toISOString(), tokenVerified: true } }
      : {}),
  });
}

describe("a signer's trust is about the certificate that signed", () => {
  test('another certificate in the CMS that reaches an anchor proves nothing', async () => {
    const root = await createAuthorityRoot('a trusted root');
    const unrelated = await createIdentity({ commonName: 'someone else', issuer: root });
    const signer = await createIdentity({ commonName: 'the signer', ca: true });
    const cms = await signatureBy(signer, [unrelated.certificate, root.certificate]);

    const verdict = await validateChain(cms, { anchors: async () => [root.certificate] });
    expect(verdict.status).toBe('untrusted');
    expect(verdict.path).toBeUndefined();
  });

  test('a real chain is found whatever order the CMS carries it in', async () => {
    const root = await createAuthorityRoot('root');
    const intermediate = await createAuthorityRoot('intermediate', root);
    const signer = await createIdentity({ commonName: 'the signer', issuer: intermediate });
    const trust = { anchors: async () => [root.certificate] };

    for (const carried of [
      [intermediate.certificate],
      [intermediate.certificate, root.certificate],
      [root.certificate, intermediate.certificate],
    ]) {
      const verdict = await validateChain(await signatureBy(signer, carried), trust);
      expect(verdict.status).toBe('trusted');
      same(verdict.path![0]!, signer.certificate);
      same(verdict.path![verdict.path!.length - 1]!, root.certificate);
    }
  });

  test('an expired signer is untrusted, however good the certificates above it are', async () => {
    const longValid = { notBefore: daysAgo(60) };
    const root = await createAuthorityRoot('root', undefined, longValid);
    const intermediate = await createAuthorityRoot('intermediate', root, longValid);
    const signer = await createIdentity({
      commonName: 'the signer',
      issuer: intermediate,
      notBefore: daysAgo(30),
      notAfter: daysAgo(10),
    });
    const cms = await signatureBy(signer, [intermediate.certificate]);
    const trust = { anchors: async () => [root.certificate] };

    expect((await validateChain(cms, trust)).status).toBe('untrusted');
    // Judged while it was valid, the same chain is trusted.
    const then = { kind: 'timestamp', genTime: daysAgo(20).toISOString(), tokenVerified: true };
    expect((await validateChain(cms, trust, then as never)).status).toBe('trusted');
  });

  test('a signer that is its own anchor is judged itself, with other anchors around', async () => {
    const signer = await createIdentity({
      commonName: 'expired self-signed signer',
      ca: true,
      notBefore: daysAgo(30),
      notAfter: daysAgo(10),
    });
    const otherRoot = await createAuthorityRoot('a root that is still valid');
    const cms = await signatureBy(signer);

    const verdict = await validateChain(cms, {
      anchors: async () => [signer.certificate, otherRoot.certificate],
    });
    expect(verdict.status).toBe('untrusted');
  });

  test('a missing issuer is named', async () => {
    const root = await createAuthorityRoot('root');
    const intermediate = await createAuthorityRoot('the intermediate', root);
    const signer = await createIdentity({ commonName: 'the signer', issuer: intermediate });
    const trust = { anchors: async () => [root.certificate] };

    const verdict = await validateChain(await signatureBy(signer), trust);
    expect(verdict.status).toBe('untrusted');
    expect(verdict.reason).toBe('no certificate was found that issued "the signer"');
  });

  test('timestamp anchors never vouch for a signer', async () => {
    const root = await createAuthorityRoot('a public authority root');
    const signer = await createIdentity({ commonName: 'the signer', issuer: root });
    const cms = await signatureBy(signer);

    const split: TrustPort = {
      anchors: async () => [],
      timestampAnchors: async () => [root.certificate],
    };
    expect((await validateChain(cms, split)).status).toBe('unknown');
    const other = await createAuthorityRoot('the company root');
    const both: TrustPort = {
      anchors: async () => [other.certificate],
      timestampAnchors: async () => [root.certificate],
    };
    expect((await validateChain(cms, both)).status).toBe('untrusted');
  });
});

describe("a timestamp authority's trust", () => {
  test('a certificate that is itself a timestamp anchor is trusted directly', async () => {
    const authority = await createTestTimestampAuthority();
    const token = await authority.sign({ digest, algorithm: 'sha256', subFilter: 'ETSI.RFC3161' });
    const check = await checkTimestampToken({ token, stamped });
    const judge = (trust: TrustPort) =>
      validateTimestampAuthority({ token: check.token!, trust, genTime: check.info!.genTime });

    const trusted = await judge({
      anchors: async () => [],
      timestampAnchors: async () => [authority.certificate],
    });
    expect(trusted.status).toBe('trusted');
    expect(trusted.path).toHaveLength(1);
    same(trusted.path![0]!, authority.certificate);

    const other = await createTestTimestampAuthority();
    const untrusted = await judge({
      anchors: async () => [],
      timestampAnchors: async () => [other.certificate],
    });
    expect(untrusted.status).toBe('untrusted');
  });

  test('a path leads from the authority to a root among the timestamp anchors', async () => {
    const root = await createAuthorityRoot('authority root');
    const authority = await createTimestampAuthorityIdentity('authority', root);
    const verdict = await authorityTrust(authority, {
      anchors: async () => [],
      timestampAnchors: async () => [root.certificate],
    });
    expect(verdict.status).toBe('trusted');
    same(verdict.path![0]!, authority.certificate);
    same(verdict.path![verdict.path!.length - 1]!, root.certificate);
  });

  test('an issuer the token does not carry is found in the signature it sits in', async () => {
    const root = await createAuthorityRoot('authority root');
    const intermediate = await createAuthorityRoot('authority intermediate', root);
    const authority = await createTimestampAuthorityIdentity('authority', intermediate);
    const trust: TrustPort = {
      anchors: async () => [],
      timestampAnchors: async () => [root.certificate],
    };

    const alone = await authorityTrust(authority, trust);
    expect(alone.status).toBe('untrusted');
    expect(alone.reason).toBe('no certificate was found that issued "authority"');

    const helped = await authorityTrust(authority, trust, {
      certificates: [intermediate.certificate],
    });
    expect(helped.status).toBe('trusted');
  });

  test('a port without timestamp anchors answers with its anchors', async () => {
    const root = await createAuthorityRoot('one root for both');
    const authority = await createTimestampAuthorityIdentity('authority', root);

    const one = await authorityTrust(authority, { anchors: async () => [root.certificate] });
    expect(one.status).toBe('trusted');

    // A port that has the member trusts exactly what it returns: its anchors are not asked.
    const empty = await authorityTrust(authority, {
      anchors: async () => [root.certificate],
      timestampAnchors: async () => [],
    });
    expect(empty).toMatchObject({ status: 'unknown', reason: 'no timestamp anchors configured' });

    expect(await authorityTrust(authority, null)).toMatchObject({ status: 'unknown' });
    expect(await authorityTrust(authority, { anchors: async () => [] })).toMatchObject({
      status: 'unknown',
      reason: 'no trust anchors configured',
    });
  });

  test('the certificate must be made for timestamping and nothing else, critically', async () => {
    const root = await createAuthorityRoot('authority root');
    const trust: TrustPort = {
      anchors: async () => [],
      timestampAnchors: async () => [root.certificate],
    };
    const codeSigning = '1.3.6.1.5.5.7.3.3';
    const cases: [Parameters<typeof createIdentity>[0], string][] = [
      [{ commonName: 'no purpose' }, 'has no extended key usage'],
      [{ commonName: 'another purpose', purposes: [codeSigning] }, 'does not allow timestamping'],
      [
        { commonName: 'two purposes', purposes: [OID.timeStamping, codeSigning] },
        'allows other uses besides timestamping',
      ],
      [
        { commonName: 'not critical', purposes: [OID.timeStamping], purposesCritical: false },
        'does not mark its timestamping purpose as critical',
      ],
    ];
    for (const [input, reason] of cases) {
      const authority = await createIdentity({ ...input, issuer: root });
      // The token itself is sound: purpose is a matter of trust, not of cryptography.
      const verdict = await authorityTrust(authority, trust);
      expect(verdict.status, input.commonName).toBe('untrusted');
      expect(verdict.reason).toContain(reason);
    }
  });

  test('a token dated outside its certificate is untrusted', async () => {
    const authority = await createTimestampAuthorityIdentity('authority', undefined, {
      notBefore: daysAgo(10),
    });
    const trust: TrustPort = {
      anchors: async () => [],
      timestampAnchors: async () => [authority.certificate],
    };
    const before = await authorityTrust(authority, trust, { genTime: daysAgo(20) });
    expect(before).toMatchObject({
      status: 'untrusted',
      reason: "the token is dated outside its authority certificate's validity",
    });
    expect((await authorityTrust(authority, trust, { genTime: daysAgo(5) })).status).toBe(
      'trusted',
    );
  });

  test('an expired authority is untrusted now, and trusted at a time it was valid', async () => {
    const root = await createAuthorityRoot('authority root', undefined, { notBefore: daysAgo(60) });
    const validity = { notBefore: daysAgo(30), notAfter: daysAgo(10) };
    const issued = await createTimestampAuthorityIdentity('issued authority', root, validity);
    const selfSigned = await createTimestampAuthorityIdentity('own anchor', undefined, validity);
    const trust: TrustPort = {
      anchors: async () => [],
      timestampAnchors: async () => [root.certificate, selfSigned.certificate],
    };
    for (const authority of [issued, selfSigned]) {
      const genTime = daysAgo(20);
      expect((await authorityTrust(authority, trust, { genTime })).status).toBe('untrusted');
      const then = await authorityTrust(authority, trust, { genTime, at: daysAgo(15) });
      expect(then.status).toBe('trusted');
    }
  });
});
