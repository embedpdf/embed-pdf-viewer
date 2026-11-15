import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { validationInfoEntryProblem } from '@embedpdf/engine-core';
import { createLocalEngine, type DocumentHandle, type Engine } from '../src/index';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/signature-long-term');

/**
 * The files of `fixtures/signature-long-term` that hold validation data, as an independent
 * reader (qpdf) counts it: each stream once, the store's lists and then what only its index
 * names. Acrobat wrote the first six: lists that are objects of their own, compressed streams
 * and an index. pyHanko wrote the others: lists inside the store, with and without an index.
 */
const WITH_A_STORE = [
  'acrobat-lt.pdf',
  'acrobat-lta+acrobat-comment.pdf',
  'acrobat-lta+acrobat-timestamp.pdf',
  'acrobat-lta.pdf',
  'grow-acrobat-lta+second-signature.pdf',
  'grow-acrobat-lta+second-timestamp.pdf',
  'iso-p1+store-only.pdf',
  'iso-p1-pdf20+store-only.pdf',
  'iso-p2+store-only+timestamp-only.pdf',
  'iso-p2+store-only.pdf',
  'ours-b-t+lt-no-vri+lta.pdf',
  'ours-b-t+lt-no-vri.pdf',
  'ours-certified-p1-b-t+lt-no-vri+lta.pdf',
  'pyhanko-certified-p1-b-lta.pdf',
];
const STORED = { certificates: 5, ocspResponses: 1, crls: 1 };
const NOTHING = { certificates: 0, ocspResponses: 0, crls: 0 };

/** One DER object that no file holds. */
const NEW_LIST = Uint8Array.from([0x30, 0x05, 0x04, 0x03, 0x6e, 0x65, 0x77]);

describe('validation data in files Acrobat and pyHanko wrote', () => {
  let engine: Engine;
  let opened = 0;

  beforeAll(() => {
    engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
  });
  afterAll(async () => {
    await engine.destroy();
  });

  async function withDocument<T>(bytes: Uint8Array, body: (doc: DocumentHandle) => Promise<T>) {
    const doc = await engine.open({ kind: 'bytes', id: `validation-info-${opened++}`, bytes });
    try {
      return await body(doc);
    } finally {
      await doc.close();
    }
  }
  const fixture = async (file: string) => new Uint8Array(await readFile(resolve(fixtures, file)));
  const counts = async (doc: DocumentHandle) => {
    const info = await doc.signatures.getValidationInfo();
    return {
      certificates: info.certificates.length,
      ocspResponses: info.ocspResponses.length,
      crls: info.crls.length,
    };
  };

  test('every file reads what an independent reader counts, and each entry is one DER object', async () => {
    const files = (await readdir(fixtures)).filter((file) => file.endsWith('.pdf')).sort();
    expect(files.filter((file) => WITH_A_STORE.includes(file))).toEqual(WITH_A_STORE);
    for (const file of files) {
      await withDocument(await fixture(file), async (doc) => {
        const info = await doc.signatures.getValidationInfo();
        expect(await counts(doc), file).toEqual(WITH_A_STORE.includes(file) ? STORED : NOTHING);
        for (const entry of [...info.certificates, ...info.ocspResponses, ...info.crls]) {
          expect(validationInfoEntryProblem(entry), file).toBeNull();
        }
        // What the file holds is not stored again, whatever its layout and compression.
        if (doc.security.allows('doc.sign')) {
          expect((await doc.signatures.addValidationInfo(info)).added, file).toEqual(NOTHING);
        }
      });
    }
  });

  test.each([
    ['a list that is an object of its own (Acrobat)', 'acrobat-lt.pdf'],
    ['a list inside the store (pyHanko)', 'ours-b-t+lt-no-vri.pdf'],
  ])('an entry joins %s, and the signature stays as it was', async (_layout, file) => {
    const loaded = await fixture(file);
    const saved = await withDocument(loaded, async (doc) => {
      const added = await doc.signatures.addValidationInfo({ crls: [NEW_LIST] });
      expect(added.added).toEqual({ ...NOTHING, crls: 1 });
      return doc.download();
    });
    // A revision after the loaded bytes: nothing a signature covers moved.
    expect(Buffer.from(saved.subarray(0, loaded.length)).equals(Buffer.from(loaded))).toBe(true);
    await withDocument(saved, async (doc) => {
      expect(await counts(doc)).toEqual({ ...STORED, crls: 2 });
      const info = await doc.signatures.getValidationInfo();
      expect([...info.crls[1]!]).toEqual([...NEW_LIST]);
      const analysis = await doc.signatures.analyze({ since: { signatureIndex: 0 } });
      expect(analysis.verdict).toBe('permitted');
    });
  });
});
