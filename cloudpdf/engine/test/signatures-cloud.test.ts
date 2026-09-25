/**
 * Digital signatures over the cloud engine, end to end: a real
 * @cloudpdf/server with the native runtime behind the `@cloudpdf/engine`
 * client. The contract under test is the server phase's laws — a
 * signature publishes a new base version, every layer sits over (or
 * behind) it, signed bytes are served per version, a pending signing
 * blocks writes, and completion is idempotent.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  buildDetachedCms,
  createTestSigner,
  profileFor,
  sign,
  validateSignatures,
} from '@embedpdf/core-signature';
import type { SignatureSubFilter } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'packages',
  'engine',
  'main',
  'test',
  'fixtures',
  'unsigned_sigfield.pdf',
);

const TENANT_ID = 'cloud-signatures-tenant';
const DOC_ID = 'cloud-signatures-doc';
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

let fx: DbSeededFixture | undefined;
let seeded: { sha: string; size: number };

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-signatures-secret' });
  seeded = await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, fixturePath, 1);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

async function openLayer(layer: string) {
  const engine = cloudEngine({
    baseUrl: fx!.baseUrl,
    token: docScopedToken(fx!, TENANT_ID, DOC_ID, ['*'], layer),
  });
  const doc = await engine.open({ kind: 'id', id: DOC_ID, layerName: layer });
  return { engine, doc };
}

async function fetchJson<T>(path: string, layer: string): Promise<T> {
  const res = await fetch(`${fx!.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${docScopedToken(fx!, TENANT_ID, DOC_ID, ['*'], layer)}` },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as T;
}

const errorCode = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof EngineError ? e.code : `not-engine-error: ${String(e)}`;
  }
};

describe('digital signatures (cloud SDK, real runtime)', () => {
  test('a certification signs the layer, publishes a version, and every read follows it', async () => {
    const signer = await createTestSigner({ commonName: 'Cloud Signer' });
    const bob = await openLayer('bob');
    const alice = await openLayer('alice');
    try {
      // Bob edits his own layer before Alice signs: he will be behind the head.
      await bob.doc.forms.setValue(
        { kind: 'fqn', name: 'group.total' },
        { type: 'text', value: 'bob' },
      );
      const bobBefore = await bob.doc.signatures!.list();
      expect(bobBefore.signatures.some((s) => s.signed)).toBe(false);

      const before = await alice.doc.signatures!.list();
      expect(before.chainValid).toBe(true);
      expect(before.signatures.map((s) => [s.fieldName, s.signed])).toEqual([['sig', false]]);

      await alice.doc.forms.setValue(
        { kind: 'fqn', name: 'group.total' },
        { type: 'text', value: 'alice' },
      );
      const result = await sign(alice.doc, {
        field: { kind: 'fqn', name: 'sig' },
        certify: { permission: 2 },
        signer,
      });
      expect(result.status).toBe('completed');
      expect(result.signature.signed).toBe(true);
      expect(result.signature.coverage).toBe('whole-revision');
      expect(result.signature.docMdp).toBe(2);
      expect(result.previous).toEqual({ baseSha256: seeded.sha, editsVersion: 2 });
      expect(result.version.sha256).not.toBe(seeded.sha);
      expect(result.version.byteLength).toBeGreaterThan(seeded.size);
      expect(result.protection.certification?.permission).toBe(2);

      // The layer is clean over the new version: every plane inherited again.
      const manifest = await fetchJson<{
        baseSha: string;
        baseByteLength: number;
        layerVersion: number;
        working: boolean;
        scopes: Record<string, string>;
      }>(`/v1/docs/${DOC_ID}/layers/alice/manifest`, 'alice');
      expect(manifest.baseSha).toBe(result.version.sha256);
      expect(manifest.baseByteLength).toBe(result.version.byteLength);
      expect(manifest.working).toBe(false);
      // A fresh layer (0) → the fill (1) → prepare (2) → complete (3).
      expect(manifest.layerVersion).toBe(3);
      expect(Object.values(manifest.scopes)).toEqual(
        Object.values(manifest.scopes).map(() => 'base'),
      );

      // The snapshot describes the sealed bytes; the fill and the signature share one revision.
      const after = await alice.doc.signatures!.list();
      expect(after.revisions).toHaveLength(before.revisions.length + 1);
      const sig = after.signatures.find((s) => s.fieldName === 'sig')!;
      expect(sig.signed).toBe(true);
      expect(sig.revisionIndex).toBe(after.revisions.length - 1);
      const total = (await alice.doc.forms.list()).fields.find((f) => f.name === 'group.total');
      expect(JSON.stringify(total?.value)).toContain('alice');

      // Signed bytes are served per version: contents, digest, the revision prefix, the whole file.
      const contents = await alice.doc.signatures!.getContents({ kind: 'fqn', name: 'sig' });
      expect(contents.byteLength).toBe(sig.contentsSize);
      expect(contents[0]).toBe(0x30);
      const digest = await alice.doc.signatures!.getDigest({ kind: 'fqn', name: 'sig' }, 'sha256');
      expect(digest.byteLength).toBe(32);
      const revision0 = await alice.doc.signatures!.downloadRevision(0);
      expect(revision0.byteLength).toBe(seeded.size);
      expect(sha256(revision0)).toBe(seeded.sha);
      const download = await fetch(
        `${fx!.baseUrl}/v1/docs/${DOC_ID}/versions/download/${result.version.sha256}`,
        {
          headers: {
            Authorization: `Bearer ${docScopedToken(fx!, TENANT_ID, DOC_ID, ['*'], 'alice')}`,
          },
        },
      );
      expect(download.status).toBe(200);
      expect(download.headers.get('cache-control')).toContain('immutable');
      const sealed = new Uint8Array(await download.arrayBuffer());
      expect(sealed.byteLength).toBe(result.version.byteLength);
      expect(sha256(sealed)).toBe(result.version.sha256);
      // Interop hook: dump the published version and its anchor for an
      // external validator (pyHanko) when asked.
      if (process.env['EPDF_SIGN_DUMP']) {
        await writeFile(join(process.env['EPDF_SIGN_DUMP'], 'published.pdf'), sealed);
        await writeFile(join(process.env['EPDF_SIGN_DUMP'], 'anchor.der'), signer.certificate);
      }

      // Cryptography over the served bytes: the CMS verifies against the digest the server serves.
      const verdicts = await validateSignatures(alice.doc, {
        trust: { anchors: async () => [signer.certificate] },
      });
      expect(verdicts.map((v) => [v.integrity, v.cryptography, v.modifications.verdict])).toEqual([
        ['valid', 'valid', 'unchanged'],
      ]);

      // The catalog: version 2 descends from version 1.
      const versions = await fetchJson<{
        head: string;
        versions: Array<{
          sha256: string;
          number: number;
          parentSha256: string | null;
          producer: string;
        }>;
      }>(`/v1/docs/${DOC_ID}/versions`, 'alice');
      expect(versions.head).toBe(result.version.sha256);
      expect(
        versions.versions.map((v) => [v.number, v.sha256, v.parentSha256, v.producer]),
      ).toEqual([
        [1, seeded.sha, null, 'upload'],
        [2, result.version.sha256, seeded.sha, 'signature'],
      ]);

      // History of the version: what the signature sealed changed nothing after it.
      const history = await alice.doc.signatures!.analyze({ since: { signatureIndex: 0 } });
      expect(history.verdict).toBe('unchanged');
      expect(history.basis.version.sha256).toBe(result.version.sha256);

      // Bob is behind the head: diverged everywhere, and he cannot sign until rebased.
      const bobManifest = await fetchJson<{ baseSha: string; scopes: Record<string, string> }>(
        `/v1/docs/${DOC_ID}/layers/bob/manifest`,
        'bob',
      );
      expect(bobManifest.baseSha).toBe(seeded.sha);
      expect(bobManifest.scopes).toMatchObject({
        content: 'layer',
        metadata: 'layer',
        layout: 'layer',
      });
      expect(
        await errorCode(bob.doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' } })),
      ).toBe(EngineErrorCode.StaleBase);
    } finally {
      await alice.doc.close();
      await bob.doc.close();
      await alice.engine.destroy();
      await bob.engine.destroy();
    }
  });

  test('a new layer over the published version: fills are permitted, a pending signing blocks writes, abort frees it', async () => {
    const carol = await openLayer('carol');
    try {
      const snapshot = await carol.doc.signatures!.list();
      expect(snapshot.signatures.find((s) => s.fieldName === 'sig')?.signed).toBe(true);
      expect(snapshot.protection.certification?.permission).toBe(2);

      // A form fill on a P=2 document is permitted; the working copy is judged at the layer URL.
      await carol.doc.forms.setValue(
        { kind: 'fqn', name: 'group.total' },
        { type: 'text', value: 'carol' },
      );
      const analysis = await carol.doc.signatures!.analyze({ since: { signatureIndex: 0 } });
      expect(analysis.basis.source).toBe('working-copy');
      expect(analysis.verdict).toBe('permitted');

      // A second signature needs a second field; preparing on the signed one is refused.
      expect(
        await errorCode(carol.doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' } })),
      ).toBe(EngineErrorCode.SignatureRefused);
    } finally {
      await carol.doc.close();
      await carol.engine.destroy();
    }
  });

  test('prepare blocks writes until abort; completion is idempotent and refuses a different CMS', async () => {
    // A second document so this test owns its head.
    const docId = 'cloud-signatures-doc-2';
    const seeded2 = await seedDocumentFromBytes(fx!, TENANT_ID, docId, fixturePath, 1);
    const engine = cloudEngine({
      baseUrl: fx!.baseUrl,
      token: docScopedToken(fx!, TENANT_ID, docId, ['*'], 'dave'),
    });
    const doc = await engine.open({ kind: 'id', id: docId, layerName: 'dave' });
    try {
      const signer = await createTestSigner({ commonName: 'Dave' });
      const prepared = await doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' } });
      expect(prepared.expectedVersion).toEqual({ baseSha256: seeded2.sha, editsVersion: 1 });
      expect(prepared.expiresAt).not.toBeNull();
      // Pending: the layer is read-only.
      expect(
        await errorCode(
          doc.forms.setValue({ kind: 'fqn', name: 'group.total' }, { type: 'text', value: 'x' }),
        ),
      ).toBe(EngineErrorCode.SigningPending);
      expect(
        await errorCode(doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' } })),
      ).toBe(EngineErrorCode.SigningPending);
      expect((await doc.signatures!.cancel(prepared.signingId)).status).toBe('aborted');
      expect((await doc.signatures!.cancel(prepared.signingId)).status).toBe('unknown');
      // Writable again; the aborted candidate is gone for good.
      await doc.forms.setValue(
        { kind: 'fqn', name: 'group.total' },
        { type: 'text', value: 'dave' },
      );
      expect(
        await errorCode(
          doc.signatures!.complete({
            signingId: prepared.signingId,
            cms: new Uint8Array([0x30, 3, 2, 1, 1]),
            expectedVersion: prepared.expectedVersion,
          }),
        ),
      ).toBe(EngineErrorCode.SigningExpired);

      // Sign for real, then replay.
      const again = await doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' } });
      // Fresh (0) → the aborted prepare (1) → the fill (2) → this prepare (3).
      expect(again.expectedVersion.editsVersion).toBe(3);
      const cms = await buildDetachedCms({
        digest: again.digest,
        hash: again.algorithm,
        profile: profileFor(again.subFilter as SignatureSubFilter),
        signer,
      });
      const completed = await doc.signatures!.complete({
        signingId: again.signingId,
        cms,
        expectedVersion: again.expectedVersion,
      });
      expect(completed.status).toBe('completed');
      const replay = await doc.signatures!.complete({
        signingId: again.signingId,
        cms,
        expectedVersion: again.expectedVersion,
      });
      expect(replay.status).toBe('already-completed');
      expect(replay.version).toEqual(completed.version);
      expect(
        await errorCode(
          doc.signatures!.complete({
            signingId: again.signingId,
            cms: new Uint8Array([0x30, 3, 2, 1, 2]),
            expectedVersion: again.expectedVersion,
          }),
        ),
      ).toBe(EngineErrorCode.SignatureRefused);
      expect((await doc.signatures!.cancel(again.signingId)).status).toBe('already-completed');
      // A stale fence is refused before any byte is touched.
      const third = await doc
        .signatures!.prepare({ field: { kind: 'fqn', name: 'sig' } })
        .catch((e) => e);
      expect(third).toBeInstanceOf(EngineError);
      expect((third as EngineError).code).toBe(EngineErrorCode.SignatureRefused);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });
});
