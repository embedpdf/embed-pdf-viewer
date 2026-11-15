/**
 * Long-term validation over the cloud engine, end to end: a real
 * @cloudpdf/server with the native runtime behind the `@cloudpdf/engine`
 * client. Validation data is stored through a route of its own and read
 * pinned at the document version, another session on the layer hears of it,
 * the signature package's `addValidationInfo()` runs unchanged over it, a
 * document timestamp needs no field, and an older server is never sent any
 * of it.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  addValidationInfo,
  createTestCertificateAuthority,
  createTestSigner,
  createTestTimestampAuthority,
  sign,
  validateSignatures,
} from '@embedpdf/core-signature';
import type { DocumentEvent } from '@embedpdf/engine-core/runtime';
import { EngineErrorCode } from '@embedpdf/engine-core/runtime';
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

const TENANT_ID = 'cloud-validation-info-tenant';
const FIELD = { kind: 'fqn', name: 'sig' } as const;

let fx: DbSeededFixture | undefined;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-validation-info-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

async function open(docId: string, fetchFn?: typeof fetch) {
  const engine = cloudEngine({
    baseUrl: fx!.baseUrl,
    token: docScopedToken(fx!, TENANT_ID, docId, ['*'], 'default'),
    ...(fetchFn ? { fetch: fetchFn } : {}),
  });
  return { engine, doc: await engine.open({ kind: 'id', id: docId, layerName: 'default' }) };
}

async function waitFor(predicate: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

describe('validation data (cloud SDK, real runtime)', () => {
  test('it is stored and read back, and another session on the layer hears of it', async () => {
    const docId = 'cloud-validation-info-events';
    await seedDocumentFromBytes(fx!, TENANT_ID, docId, fixturePath, 1);
    const writer = await open(docId);
    const watcher = await open(docId);
    try {
      const heard: DocumentEvent[] = [];
      const own: DocumentEvent[] = [];
      const stop = watcher.doc.events.subscribe((event) => heard.push(event));
      const stopOwn = writer.doc.events.subscribe((event) => own.push(event));
      // Let the watcher's live stream connect before anything happens.
      await watcher.doc.pages.list();

      expect(await writer.doc.signatures.getValidationInfo()).toEqual({
        certificates: [],
        ocspResponses: [],
        crls: [],
      });
      // All the engine asks of an entry is that it is one DER object.
      const first = (await createTestSigner({ commonName: 'One' })).certificate;
      const second = (await createTestSigner({ commonName: 'Two' })).certificate;
      const stored = await writer.doc.signatures.addValidationInfo({
        certificates: [first],
        crls: [second],
      });
      expect(stored.added).toEqual({ certificates: 1, ocspResponses: 0, crls: 1 });

      await waitFor(
        () => heard.some((event) => event.type === 'signatures.validationInfoAdded'),
        'the stored validation data',
      );
      const remote = heard.find((event) => event.type === 'signatures.validationInfoAdded')!;
      expect(remote).toMatchObject({
        origin: { kind: 'remote' },
        added: { certificates: 1, ocspResponses: 0, crls: 1 },
      });
      expect(own.map((event) => event.type)).toEqual(['signatures.validationInfoAdded']);

      // Both sessions read the layer as it is now.
      for (const session of [writer, watcher]) {
        const info = await session.doc.signatures.getValidationInfo();
        expect(info.certificates.map(hex)).toEqual([hex(first)]);
        expect(info.crls.map(hex)).toEqual([hex(second)]);
      }

      // What the file holds is not stored again: nothing is written and nobody hears of it.
      const again = await writer.doc.signatures.addValidationInfo({ certificates: [first] });
      expect(again.added).toEqual({ certificates: 0, ocspResponses: 0, crls: 0 });
      expect(own).toHaveLength(1);
      // An entry that is not DER fails the call, names the entry, and stores nothing.
      await expect(
        writer.doc.signatures.addValidationInfo({
          ocspResponses: [new TextEncoder().encode('-----BEGIN')],
        }),
      ).rejects.toMatchObject({
        code: EngineErrorCode.InvalidArg,
        details: { field: 'ocspResponses[0]' },
      });
      stop();
      stopOwn();
    } finally {
      await watcher.doc.close();
      await watcher.engine.destroy();
      await writer.doc.close();
      await writer.engine.destroy();
    }
  });

  test('the whole way: sign, keep it checkable, then timestamp the document with no field', async () => {
    const docId = 'cloud-validation-info-whole-way';
    await seedDocumentFromBytes(fx!, TENANT_ID, docId, fixturePath, 1);
    const { engine, doc } = await open(docId);
    try {
      const ca = await createTestCertificateAuthority();
      const signer = await ca.issueSigner({ commonName: 'Ada' });
      const timestampAuthority = await createTestTimestampAuthority();
      const trust = {
        anchors: async () => [ca.certificate],
        timestampAnchors: async () => [timestampAuthority.certificate],
      };

      await sign(doc, { field: FIELD, key: signer, timestampAuthority });
      const [before] = await validateSignatures(doc, { trust });
      expect(before).toMatchObject({ summary: 'valid', longTerm: { enabled: false } });

      // The app collects, as it does locally; the server stores what it is given.
      const added = await addValidationInfo(doc, { trust, revocation: ca.revocation });
      expect(added.added.ocspResponses).toBeGreaterThan(0);
      expect(added.verdicts[0]).toMatchObject({
        summary: 'valid',
        revocation: 'good',
        longTerm: { enabled: true, documentTimestampedAt: null },
      });

      const stamped = await sign(doc, {
        kind: 'timestamp',
        key: timestampAuthority,
        timestampTrust: trust,
      });
      expect(stamped.signature).toMatchObject({ kind: 'timestamp', fieldName: 'Timestamp1' });

      const verdicts = await validateSignatures(doc, { trust });
      const signed = verdicts.find((verdict) => verdict.signature.fieldName === 'sig')!;
      expect(signed).toMatchObject({ summary: 'valid', longTerm: { enabled: true } });
      expect(signed.longTerm.documentTimestampedAt).not.toBeNull();
      expect(signed.modifications.verdict).toBe('permitted');
      // The answers are in the file the timestamp made.
      expect((await doc.signatures.getValidationInfo()).ocspResponses.length).toBeGreaterThan(0);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });

  test('an older server is never sent them, and the refusal names both versions', async () => {
    const docId = 'cloud-validation-info-older-server';
    await seedDocumentFromBytes(fx!, TENANT_ID, docId, fixturePath, 1);
    // A fetch through which the server says it is 3.1, recording what it was sent.
    const sent: string[] = [];
    const olderServer: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      sent.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
      const response = await fetch(input, init);
      const headers = new Headers(response.headers);
      headers.set('EmbedPDF-Server-Version', '3.1');
      return new Response(response.body, { status: response.status, headers });
    };
    const { engine, doc } = await open(docId, olderServer);
    try {
      const refusal = {
        code: EngineErrorCode.NotImplemented,
        details: { needs: '3.3', serverVersion: '3.1' },
      };
      await expect(doc.signatures.getValidationInfo()).rejects.toMatchObject(refusal);
      await expect(doc.signatures.addValidationInfo({ certificates: [] })).rejects.toMatchObject(
        refusal,
      );
      await expect(doc.signatures.prepare({ kind: 'timestamp' })).rejects.toMatchObject(refusal);
      expect(sent.filter((request) => request.includes('/signatures/validation-info'))).toEqual([]);
      expect(sent.filter((request) => request.endsWith('/signatures/prepare'))).toEqual([]);
      // Everything else keeps working: a prepare with its field goes out.
      const prepared = await doc.signatures.prepare({ field: FIELD });
      await doc.signatures.cancel(prepared.signingId);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });
});
