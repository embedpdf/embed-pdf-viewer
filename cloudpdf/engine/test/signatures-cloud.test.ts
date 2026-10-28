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
import type { ObjectNumbersLost, SignatureSubFilter } from '@embedpdf/engine-core/runtime';
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

async function openLayer(layer: string, docId = DOC_ID) {
  const engine = cloudEngine({
    baseUrl: fx!.baseUrl,
    token: docScopedToken(fx!, TENANT_ID, docId, ['*'], layer),
  });
  const doc = await engine.open({ kind: 'id', id: docId, layerName: layer });
  return { engine, doc };
}

async function fetchJson<T>(path: string, layer: string, docId = DOC_ID): Promise<T> {
  const res = await fetch(`${fx!.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${docScopedToken(fx!, TENANT_ID, docId, ['*'], layer)}` },
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

async function waitFor(predicate: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('digital signatures (cloud SDK, real runtime)', () => {
  test('another session on the layer hears prepare, cancel and complete', async () => {
    // Its own document: the completion below publishes a new version.
    const docId = 'cloud-signatures-events-doc';
    await seedDocumentFromBytes(fx!, TENANT_ID, docId, fixturePath, 1);
    const open = async () => {
      const engine = cloudEngine({
        baseUrl: fx!.baseUrl,
        token: docScopedToken(fx!, TENANT_ID, docId, ['*'], 'default'),
      });
      return { engine, doc: await engine.open({ kind: 'id', id: docId, layerName: 'default' }) };
    };
    const signerSession = await open();
    const watcher = await open();
    try {
      const heard: string[] = [];
      const stop = watcher.doc.events.subscribe((event) => heard.push(event.type));
      // Let the watcher's live stream connect before anything happens.
      await watcher.doc.pages.list();

      const field = { kind: 'fqn', name: 'sig' } as const;
      const first = await signerSession.doc.signatures.prepare({ field });
      await waitFor(() => heard.includes('signatures.prepared'), 'the prepare');
      await signerSession.doc.signatures.cancel(first.signingId);
      await waitFor(() => heard.includes('signatures.cancelled'), 'the cancel');

      const key = await createTestSigner({ commonName: 'Events Signer' });
      await sign(signerSession.doc, { field, key });
      await waitFor(() => heard.includes('document.versioned'), 'the completion');
      stop();
      expect(heard).toEqual([
        'signatures.prepared',
        'signatures.cancelled',
        'signatures.prepared',
        'signatures.completed',
        'document.versioned',
      ]);
      // The watcher reads the new version, not a stale manifest.
      const snapshot = await watcher.doc.signatures.list();
      expect(snapshot.signatures.find((s) => s.fieldName === 'sig')?.signed).toBe(true);
      // A rewrite would void the signature: refused, as locally.
      expect(await errorCode(watcher.doc.download({ mode: 'rewrite' }))).toBe(
        EngineErrorCode.ProtectedDocument,
      );
    } finally {
      await watcher.doc.close();
      await watcher.engine.destroy();
      await signerSession.doc.close();
      await signerSession.engine.destroy();
    }
  });

  test("a certification signs the layer into a version of its own, and the layer's reads follow it", async () => {
    const signer = await createTestSigner({ commonName: 'Cloud Signer' });
    const bob = await openLayer('bob');
    const alice = await openLayer('alice');
    try {
      // Bob edits his own layer before Alice signs: her signature never reaches him.
      await bob.doc.forms.setValue({ kind: 'fqn', name: 'group.total' }, { value: 'bob' });
      const bobBefore = await bob.doc.signatures.list();
      expect(bobBefore.signatures.some((s) => s.signed)).toBe(false);

      const before = await alice.doc.signatures.list();
      expect(before.chainValid).toBe(true);
      expect(before.signatures.map((s) => [s.fieldName, s.signed])).toEqual([['sig', false]]);

      await alice.doc.forms.setValue({ kind: 'fqn', name: 'group.total' }, { value: 'alice' });
      const held = alice.doc.objectNumbers.held;
      expect(held).toBeGreaterThan(0);
      const lost: ObjectNumbersLost[] = [];
      alice.doc.objectNumbers.onLost((event) => lost.push(event));
      const result = await sign(alice.doc, {
        field: { kind: 'fqn', name: 'sig' },
        certify: { permission: 2 },
        key: signer,
      });
      expect(result.status).toBe('completed');
      // The new version numbers its objects anew: Alice's numbers are gone.
      expect(lost).toEqual([{ numbers: expect.any(Array), reason: 'versioned' }]);
      expect(lost[0]!.numbers).toHaveLength(held);
      expect(alice.doc.objectNumbers.held).toBe(0);
      expect(result.signature.signed).toBe(true);
      expect(result.signature.coverage).toBe('whole-revision');
      expect(result.signature.docMdp).toBe(2);
      expect(result.previous).toEqual({ baseSha256: seeded.sha, editsVersion: 2 });
      expect(result.version.sha256).not.toBe(seeded.sha);
      expect(result.version.byteLength).toBeGreaterThan(seeded.size);
      expect(result.protection.certification?.permission).toBe(2);

      // The layer is clean over its new version, which isn't the document's (the
      // upload): every plane but actions is the layer's.
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
      expect(manifest.scopes).toMatchObject({
        content: 'layer',
        annotations: 'layer',
        forms: 'layer',
        layout: 'layer',
        actions: 'base',
      });

      // The snapshot describes the sealed bytes; the fill and the signature share one revision.
      const after = await alice.doc.signatures.list();
      expect(after.revisions).toHaveLength(before.revisions.length + 1);
      const sig = after.signatures.find((s) => s.fieldName === 'sig')!;
      expect(sig.signed).toBe(true);
      expect(sig.revisionIndex).toBe(after.revisions.length - 1);
      const total = (await alice.doc.forms.list()).fields.find((f) => f.name === 'group.total');
      expect(JSON.stringify(total?.value)).toContain('alice');

      // Signed bytes are served per version: contents, digest, the revision prefix, the whole file.
      const contents = await alice.doc.signatures.getContents({ kind: 'fqn', name: 'sig' });
      expect(contents.byteLength).toBe(sig.contentsSize);
      expect(contents[0]).toBe(0x30);
      const digest = await alice.doc.signatures.getDigest({ kind: 'fqn', name: 'sig' }, 'sha256');
      expect(digest.byteLength).toBe(32);
      const revision0 = await alice.doc.signatures.downloadRevision(0);
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

      // The catalog: Alice's version 2 descends from version 1; the document stays its upload.
      const versions = await fetchJson<{
        head: string;
        versions: Array<{
          sha256: string;
          number: number;
          parentSha256: string | null;
          producer: string;
        }>;
      }>(`/v1/docs/${DOC_ID}/versions`, 'alice');
      expect(versions.head).toBe(seeded.sha);
      expect(
        versions.versions.map((v) => [v.number, v.sha256, v.parentSha256, v.producer]),
      ).toEqual([
        [1, seeded.sha, null, 'upload'],
        [2, result.version.sha256, seeded.sha, 'signature'],
      ]);

      // History of the version: what the signature sealed changed nothing after it.
      const history = await alice.doc.signatures.analyze({ since: { signatureIndex: 0 } });
      expect(history.verdict).toBe('unchanged');
      expect(history.basis.version.sha256).toBe(result.version.sha256);

      // Bob is still over the upload, owning only the plane he wrote, and can sign.
      const bobManifest = await fetchJson<{ baseSha: string; scopes: Record<string, string> }>(
        `/v1/docs/${DOC_ID}/layers/bob/manifest`,
        'bob',
      );
      expect(bobManifest.baseSha).toBe(seeded.sha);
      expect(bobManifest.scopes).toMatchObject({ content: 'base', forms: 'layer' });
      expect((await bob.doc.signatures.list()).signatures.some((s) => s.signed)).toBe(false);
      const bobPrepared = await bob.doc.signatures.prepare({ field: { kind: 'fqn', name: 'sig' } });
      expect(bobPrepared.expectedVersion.baseSha256).toBe(seeded.sha);
      expect((await bob.doc.signatures.cancel(bobPrepared.signingId)).status).toBe('cancelled');
    } finally {
      await alice.doc.close();
      await bob.doc.close();
      await alice.engine.destroy();
      await bob.engine.destroy();
    }
  });

  test('a new layer starts on the upload; on the signed layer fills are permitted and the signed field refuses', async () => {
    const carol = await openLayer('carol');
    const alice = await openLayer('alice');
    try {
      // Carol never sees Alice's signature, certification or fill.
      const fresh = await carol.doc.signatures.list();
      expect(fresh.signatures.find((s) => s.fieldName === 'sig')?.signed).toBe(false);
      expect(fresh.protection.certification ?? null).toBeNull();
      const carolTotal = (await carol.doc.forms.list()).fields.find(
        (f) => f.name === 'group.total',
      );
      expect(JSON.stringify(carolTotal?.value ?? null)).not.toContain('alice');

      // Alice's layer is over her certified version (P=2).
      const snapshot = await alice.doc.signatures.list();
      expect(snapshot.signatures.find((s) => s.fieldName === 'sig')?.signed).toBe(true);
      expect(snapshot.protection.certification?.permission).toBe(2);

      // A form fill under P=2 is permitted; the working copy is judged at the layer URL.
      await alice.doc.forms.setValue({ kind: 'fqn', name: 'group.total' }, { value: 'alice 2' });
      const analysis = await alice.doc.signatures.analyze({
        since: { signatureIndex: 0 },
        until: 'working-copy',
      });
      expect(analysis.basis.source).toBe('working-copy');
      expect(analysis.verdict).toBe('permitted');

      // A second signature needs a second field; preparing on the signed one is refused.
      expect(
        await errorCode(alice.doc.signatures.prepare({ field: { kind: 'fqn', name: 'sig' } })),
      ).toBe(EngineErrorCode.SignatureRefused);
    } finally {
      await carol.doc.close();
      await alice.doc.close();
      await carol.engine.destroy();
      await alice.engine.destroy();
    }
  });

  test('prepare blocks writes until cancel; completion is idempotent and refuses a different CMS', async () => {
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
      const prepared = await doc.signatures.prepare({ field: { kind: 'fqn', name: 'sig' } });
      expect(prepared.expectedVersion).toEqual({ baseSha256: seeded2.sha, editsVersion: 1 });
      expect(prepared.expiresAt).not.toBeNull();
      // Pending: the layer is read-only.
      expect(
        await errorCode(doc.forms.setValue({ kind: 'fqn', name: 'group.total' }, { value: 'x' })),
      ).toBe(EngineErrorCode.SigningPending);
      expect(await errorCode(doc.signatures.prepare({ field: { kind: 'fqn', name: 'sig' } }))).toBe(
        EngineErrorCode.SigningPending,
      );
      expect((await doc.signatures.cancel(prepared.signingId)).status).toBe('cancelled');
      expect((await doc.signatures.cancel(prepared.signingId)).status).toBe('unknown');
      // Writable again; the cancelled candidate is gone for good.
      await doc.forms.setValue({ kind: 'fqn', name: 'group.total' }, { value: 'dave' });
      expect(
        await errorCode(
          doc.signatures.complete({
            signingId: prepared.signingId,
            cms: new Uint8Array([0x30, 3, 2, 1, 1]),
            expectedVersion: prepared.expectedVersion,
          }),
        ),
      ).toBe(EngineErrorCode.NotFound);

      // Sign for real, then replay.
      const again = await doc.signatures.prepare({ field: { kind: 'fqn', name: 'sig' } });
      // Fresh (0) → the cancelled prepare (1) → the fill (2) → this prepare (3).
      expect(again.expectedVersion.editsVersion).toBe(3);
      const cms = await buildDetachedCms({
        digest: again.digest,
        hash: again.algorithm,
        profile: profileFor(again.subFilter as SignatureSubFilter),
        signer,
      });
      const completed = await doc.signatures.complete({
        signingId: again.signingId,
        cms,
        expectedVersion: again.expectedVersion,
      });
      expect(completed.status).toBe('completed');
      const replay = await doc.signatures.complete({
        signingId: again.signingId,
        cms,
        expectedVersion: again.expectedVersion,
      });
      expect(replay.status).toBe('already-completed');
      expect(replay.version).toEqual(completed.version);
      expect(
        await errorCode(
          doc.signatures.complete({
            signingId: again.signingId,
            cms: new Uint8Array([0x30, 3, 2, 1, 2]),
            expectedVersion: again.expectedVersion,
          }),
        ),
      ).toBe(EngineErrorCode.SignatureRefused);
      expect((await doc.signatures.cancel(again.signingId)).status).toBe('already-completed');
      // A stale fence is refused before any byte is touched.
      const third = await doc.signatures
        .prepare({ field: { kind: 'fqn', name: 'sig' } })
        .catch((e) => e);
      expect(third).toBeInstanceOf(EngineError);
      expect((third as EngineError).code).toBe(EngineErrorCode.SignatureRefused);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });

  test("a second signature in the layer signs over its first: the layer's chain grows, the document stays its upload", async () => {
    const docId = 'cloud-signatures-doc-3';
    const seeded3 = await seedDocumentFromBytes(fx!, TENANT_ID, docId, fixturePath, 1);
    const erin = await openLayer('erin', docId);
    try {
      const signer = await createTestSigner({ commonName: 'Erin' });
      const page = (await erin.doc.pages.list()).pages[0]!;
      await erin.doc.forms.create({
        family: 'signature',
        name: 'sig2',
        widgets: [{ page: page.ref, rect: { x: 50, y: 50, width: 200, height: 70 } }],
      });
      const first = await sign(erin.doc, { field: { kind: 'fqn', name: 'sig' }, key: signer });
      expect(first.previous.baseSha256).toBe(seeded3.sha);
      const second = await sign(erin.doc, { field: { kind: 'fqn', name: 'sig2' }, key: signer });
      expect(second.status).toBe('completed');
      expect(second.previous.baseSha256).toBe(first.version.sha256);
      const signed = await erin.doc.signatures.list();
      expect(signed.signatures.map((s) => [s.fieldName, s.signed])).toEqual([
        ['sig', true],
        ['sig2', true],
      ]);

      const versions = await fetchJson<{
        head: string;
        versions: Array<{ sha256: string; number: number; parentSha256: string | null }>;
      }>(`/v1/docs/${docId}/versions`, 'erin', docId);
      expect(versions.head).toBe(seeded3.sha);
      expect(versions.versions.map((v) => [v.number, v.sha256, v.parentSha256])).toEqual([
        [1, seeded3.sha, null],
        [2, first.version.sha256, seeded3.sha],
        [3, second.version.sha256, first.version.sha256],
      ]);

      // A new layer: neither signature, nor the field Erin added.
      const fred = await openLayer('fred', docId);
      try {
        const fresh = await fred.doc.signatures.list();
        expect(fresh.signatures.map((s) => [s.fieldName, s.signed])).toEqual([['sig', false]]);
      } finally {
        await fred.doc.close();
        await fred.engine.destroy();
      }
    } finally {
      await erin.doc.close();
      await erin.engine.destroy();
    }
  });
});
