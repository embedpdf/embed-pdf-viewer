/**
 * The viewer-phase engine gaps: a signature field can be authored
 * (`createField` family `signature`), drawn into without signing
 * (`forms.setSignatureAppearance`, refused once signed), and the signing
 * facts travel as `attribution`.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const FAKE_CMS = new Uint8Array([0x30, 3, 2, 1, 1]);

type Engine = Awaited<ReturnType<typeof createLocalEngine>>;
let engine: Engine;
let base: Uint8Array;
let artwork: Uint8Array;

beforeAll(async () => {
  engine = await createLocalEngine();
  base = new Uint8Array(await readFile(resolve(here, 'fixtures', 'unsigned_sigfield.pdf')));
  artwork = new Uint8Array(await readFile(resolve(here, 'fixtures', 'signature_artwork.pdf')));
});
afterAll(async () => {
  await engine.destroy();
});

describe('signature fields in the viewer phase', () => {
  test('a signature field is authored, filled visually, and refuses a visual fill once signed', async () => {
    const doc = await engine.open({ kind: 'bytes', id: 'visual-fill', bytes: base }, { scope: ['*'] });
    try {
      const page = (await doc.pages.list()).pages[0]!;
      const created = await doc.forms.createField({
        family: 'signature',
        name: 'sig2',
        widget: {
          pageObjectNumber: page.pageObjectNumber,
          rect: { left: 50, bottom: 50, right: 250, top: 120 },
        },
      });
      expect(created.field.family).toBe('signature');
      expect(created.field.widgets).toHaveLength(1);
      const before = await doc.signatures!.list();
      expect(before.signatures.map((s) => [s.fieldName, s.signed])).toEqual([
        ['sig', false],
        ['sig2', false],
      ]);

      // Visual fill: the mark is drawn into the widget; the field stays unsigned.
      const filled = await doc.forms.setSignatureAppearance!(
        { kind: 'fqn', name: 'sig2' },
        { pdf: artwork },
      );
      expect(filled.field.name).toBe('sig2');
      expect(filled.meta.affectedPages.map((p) => p.pageObjectNumber)).toEqual([page.pageObjectNumber]);
      expect((await doc.signatures!.list()).signatures.find((s) => s.fieldName === 'sig2')?.signed).toBe(false);
      await expect(
        doc.forms.setSignatureAppearance!({ kind: 'fqn', name: 'group.total' }, { pdf: artwork }),
      ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });

      // Sign the other field with attribution; the facts land in the dictionary.
      const prepared = await doc.signatures!.prepare({
        field: { kind: 'fqn', name: 'sig' },
        attribution: { name: 'Bob Singor', reason: 'approved', location: 'Amsterdam' },
        appearance: { pdf: artwork },
      });
      const result = await doc.signatures!.complete({
        signingId: prepared.signingId,
        cms: FAKE_CMS,
        expectedVersion: prepared.expectedVersion,
      });
      expect(result.status).toBe('completed');
      expect(result.signature.signer).toMatchObject({
        name: 'Bob Singor',
        reason: 'approved',
        location: 'Amsterdam',
      });
      // A signed field's appearance is sealed with the signature.
      await expect(
        doc.forms.setSignatureAppearance!({ kind: 'fqn', name: 'sig' }, { pdf: artwork }),
      ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      // The unsigned field can still be redrawn after the document was versioned.
      const again = await doc.forms.setSignatureAppearance!({ kind: 'fqn', name: 'sig2' }, { pdf: artwork });
      expect(again.field.family).toBe('signature');
    } finally {
      await doc.close();
    }
  });
});
