/**
 * Judgement follows the validator the recipient uses. After an approval
 * signature, form filling, further signatures and annotations keep it valid
 * (Acrobat: "Form Fill-in, Signing and Commenting are allowed"; corpus
 * `signature-compat` v3/88-91), reported as permitted changes. A P=2
 * certification narrows that to form fill-in. And a verdict can be about the
 * bytes a save would write (`working-copy`), which is what a viewer must show
 * before the file leaves it.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '@embedpdf/engine';
import type { PageRef } from '@embedpdf/engine-core/runtime';

import { createTestSigner, sign, validateSignatures } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));

type Engine = Awaited<ReturnType<typeof createLocalEngine>>;
let engine: Engine;
let base: Uint8Array;
let signer: Awaited<ReturnType<typeof createTestSigner>>;

beforeAll(async () => {
  engine = await createLocalEngine();
  base = new Uint8Array(
    await readFile(resolve(here, '../../../engine/main/test/fixtures/unsigned_sigfield.pdf')),
  );
  signer = await createTestSigner({ commonName: 'Judgement' });
});
afterAll(async () => {
  await engine.destroy();
});

const trust = { anchors: async () => [signer.certificate] };

async function inkOn(doc: Awaited<ReturnType<Engine['open']>>) {
  const page = (await doc.pages.list()).pages[0]!;
  await doc.page(page.ref).annotations.create({
    subtype: 'ink',
    inkList: [
      [
        { x: 20, y: 20 },
        { x: 80, y: 60 },
        { x: 140, y: 15 },
      ],
    ],
    rect: { left: 10, bottom: 600, right: 200, top: 700 },
    color: { r: 0, g: 0, b: 0 },
    strokeWidth: 2,
  } as never);
}

describe('what a validator concludes', () => {
  test('an approval signature: an annotation after it is a permitted change; nothing is refused', async () => {
    const doc = await engine.open(
      { kind: 'bytes', id: 'judge-approval', bytes: base },
      { scope: ['*'] },
    );
    try {
      const signed = await sign(doc, { field: { kind: 'fqn', name: 'sig' }, signer });
      // Declared nothing, judged at the baseline; annotations are not refused.
      expect(signed.protection).toMatchObject({ enforced: null, judged: 'annotate' });
      expect(doc.security.allows('doc.annotate.modify')).toBe(true);

      // The persisted bytes: the signature seals the last revision.
      let [verdict] = await validateSignatures(doc, { trust });
      expect(verdict.summary).toBe('valid');
      expect(verdict.modifications).toEqual({ verdict: 'unchanged', basis: 'persisted' });

      // An unsaved ink stroke: the loaded bytes still say unchanged; the bytes
      // a save would write say "changed, permitted" — and the verdict says
      // which it judged.
      await inkOn(doc);
      [verdict] = await validateSignatures(doc, { trust });
      expect(verdict.summary).toBe('valid');
      expect(verdict.modifications).toEqual({ verdict: 'unchanged', basis: 'persisted' });
      [verdict] = await validateSignatures(doc, { trust, until: 'working-copy' });
      expect(verdict.summary).toBe('valid');
      expect(verdict.modifications.basis).toBe('working-copy');
      expect(verdict.modifications.verdict).toBe('permitted');

      // Saved and reopened: the file itself carries a permitted change, judged on its bytes.
      const saved = await doc.download();
      const reopened = await engine.open(
        { kind: 'bytes', id: 'judge-approval-saved', bytes: saved },
        { scope: ['*'] },
      );
      try {
        const analysis = await reopened.signatures!.analyze({ since: { signatureIndex: 0 } });
        expect(analysis.steps).toHaveLength(1);
        expect(analysis.steps[0]!.levelInForce).toBe('annotate');
        expect(analysis.verdict).toBe('permitted');
        const [reopenedVerdict] = await validateSignatures(reopened, { trust });
        expect(reopenedVerdict.summary).toBe('valid');
        expect(reopenedVerdict.modifications).toEqual({
          verdict: 'permitted',
          basis: 'persisted',
          laterRevisions: 1,
        });
        // Still possible to annotate: nothing was declared. Only a rewrite is refused.
        expect(reopened.security.allows('doc.annotate.modify')).toBe(true);
        expect(reopened.security.allows('doc.download.flattened')).toBe(false);
      } finally {
        await reopened.close();
      }
    } finally {
      await doc.close();
    }
  });

  test('a P=3 certification: the same annotation is permitted, for us and for Acrobat', async () => {
    const doc = await engine.open(
      { kind: 'bytes', id: 'judge-certify', bytes: base },
      { scope: ['*'] },
    );
    try {
      const signed = await sign(doc, {
        field: { kind: 'fqn', name: 'sig' },
        signer,
        certify: { permission: 3 },
      });
      expect(signed.protection).toMatchObject({ enforced: 'annotate', judged: 'annotate' });
      await inkOn(doc);
      const [verdict] = await validateSignatures(doc, { trust, until: 'working-copy' });
      expect(verdict.summary).toBe('valid');
      expect(verdict.modifications).toMatchObject({ verdict: 'permitted', basis: 'working-copy' });
    } finally {
      await doc.close();
    }
  });

  test('an annotation added and removed again leaves the signed bytes untouched', async () => {
    const doc = await engine.open(
      { kind: 'bytes', id: 'judge-add-remove', bytes: base },
      { scope: ['*'] },
    );
    try {
      await sign(doc, { field: { kind: 'fqn', name: 'sig' }, signer });
      const signedBytes = await doc.download();

      // The engine bakes /AP at create: the orphaned appearance stream the
      // removal leaves behind is part of this test.
      const page = (await doc.pages.list()).pages[0]!;
      const created = await doc.page(page.ref).annotations.create({
        subtype: 'square',
        rect: { left: 10, bottom: 600, right: 200, top: 700 },
        color: { r: 0, g: 0, b: 0 },
        strokeWidth: 2,
      } as never);
      let [verdict] = await validateSignatures(doc, { trust, until: 'working-copy' });
      expect(verdict.summary).toBe('valid');
      expect(verdict.modifications).toMatchObject({ verdict: 'permitted', basis: 'working-copy' });

      await doc.page(page.ref).annotations.delete(created.created.ref);
      [verdict] = await validateSignatures(doc, { trust, until: 'working-copy' });
      expect(verdict.summary).toBe('valid');
      // Nothing to judge: the bytes a save would write are the loaded bytes.
      expect(verdict.modifications).toEqual({ verdict: 'unchanged', basis: 'persisted' });

      const again = await doc.download();
      expect(Buffer.from(again).equals(Buffer.from(signedBytes))).toBe(true);

      // A different annotation afterwards is still judged: the pass elides
      // what equals the loaded document, never a real change.
      await inkOn(doc);
      [verdict] = await validateSignatures(doc, { trust, until: 'working-copy' });
      expect(verdict.summary).toBe('valid');
      expect(verdict.modifications).toMatchObject({ verdict: 'permitted', basis: 'working-copy' });
      const changed = await doc.download();
      expect(changed.byteLength).toBeGreaterThan(signedBytes.byteLength);
    } finally {
      await doc.close();
    }
  });

  test('a persisted annotation removed after a reopen leaves the signed bytes untouched', async () => {
    // The base page has no /Annots; the persisted layer's page has one. A
    // server reopens layers all the time (eviction, restart, another
    // replica): removing the annotation there must restore the base shape.
    const twoPage = new Uint8Array(
      await readFile(resolve(here, '../../../engine/main/test/fixtures/two_page_sigfield.pdf')),
    );
    const doc = await engine.open(
      { kind: 'bytes', id: 'reopen-a', bytes: twoPage },
      { scope: ['*'] },
    );
    let signed: Uint8Array;
    let artifact: Uint8Array;
    let pageRef: PageRef;
    let ref: import('@embedpdf/engine-core/runtime').AnnotationRef;
    try {
      await sign(doc, { field: { kind: 'fqn', name: 'sig' }, signer });
      signed = await doc.download();
      const page2 = (await doc.pages.list()).pages[1]!;
      pageRef = page2.ref;
      const created = await doc.page(pageRef).annotations.create({
        subtype: 'square',
        rect: { left: 20, bottom: 20, right: 120, top: 60 },
        color: { r: 1, g: 0, b: 0 },
        strokeWidth: 2,
      } as never);
      ref = created.created.ref;
      artifact = await doc.downloadLayer!();
    } finally {
      await doc.close();
    }
    const reopened = await engine.open(
      {
        kind: 'layerBytes',
        id: 'reopen-b',
        baseBytes: signed,
        layer: { kind: 'artifact', bytes: artifact },
      },
      { scope: ['*'] },
    );
    try {
      await reopened.page(pageRef).annotations.delete(ref);
      const again = await reopened.download();
      expect(Buffer.from(again).equals(Buffer.from(signed))).toBe(true);
      const [verdict] = await validateSignatures(reopened, { trust, until: 'working-copy' });
      expect(verdict.summary).toBe('valid');
      expect(verdict.modifications.verdict).toBe('unchanged');
    } finally {
      await reopened.close();
    }
  });

  test('two signatures: an annotation added and removed again keeps both sealed', async () => {
    const doc = await engine.open(
      { kind: 'bytes', id: 'judge-two-signatures', bytes: base },
      { scope: ['*'] },
    );
    try {
      await sign(doc, { field: { kind: 'fqn', name: 'sig' }, signer });
      // A new signature field after an approval signature is permitted.
      const page = (await doc.pages.list()).pages[0]!;
      await doc.forms.createField({
        family: 'signature',
        name: 'sig2',
        widget: {
          page: page.ref,
          rect: { left: 300, bottom: 50, right: 500, top: 120 },
        },
      } as never);
      await sign(doc, { field: { kind: 'fqn', name: 'sig2' }, signer });
      const sealed = await doc.download();
      let verdicts = await validateSignatures(doc, { trust });
      expect(verdicts.map((verdict) => verdict.summary)).toEqual(['valid', 'valid']);

      const created = await doc.page(page.ref).annotations.create({
        subtype: 'square',
        rect: { left: 10, bottom: 600, right: 200, top: 700 },
        color: { r: 0, g: 0, b: 0 },
        strokeWidth: 2,
      } as never);
      verdicts = await validateSignatures(doc, { trust, until: 'working-copy' });
      expect(verdicts.map((verdict) => verdict.summary)).toEqual(['valid', 'valid']);
      expect(verdicts.map((verdict) => verdict.modifications.verdict)).toEqual([
        'permitted',
        'permitted',
      ]);

      await doc.page(page.ref).annotations.delete(created.created.ref);
      verdicts = await validateSignatures(doc, { trust, until: 'working-copy' });
      expect(verdicts.map((verdict) => verdict.summary)).toEqual(['valid', 'valid']);
      expect(verdicts.map((verdict) => verdict.modifications.basis)).toEqual([
        'persisted',
        'persisted',
      ]);
      const again = await doc.download();
      expect(Buffer.from(again).equals(Buffer.from(sealed))).toBe(true);
    } finally {
      await doc.close();
    }
  });

  test('a P=2 certification refuses the annotation up front — a declaration is enforced', async () => {
    const doc = await engine.open(
      { kind: 'bytes', id: 'judge-certify-2', bytes: base },
      { scope: ['*'] },
    );
    try {
      const signed = await sign(doc, {
        field: { kind: 'fqn', name: 'sig' },
        signer,
        certify: { permission: 2 },
      });
      expect(signed.protection).toMatchObject({ enforced: 'fill', judged: 'fill' });
      expect(doc.security.allows('doc.annotate.modify')).toBe(false);
      await expect(inkOn(doc)).rejects.toMatchObject({ code: 'ProtectedDocument' });
    } finally {
      await doc.close();
    }
  });
});
