/**
 * Files that carry validation data and document timestamps, each one judged by Acrobat
 * (`observations.json`, compiled from Acrobat's own output; see the fixtures' README). What
 * changed after a signature must read here as it reads there: a signature Acrobat reports as
 * altered is `forbidden`, and one Acrobat reports as valid is not.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '@embedpdf/engine';
import {
  EngineError,
  EngineErrorCode,
  type DocumentHandle,
  type Engine,
} from '@embedpdf/engine-core/runtime';

import { validateSignatures, type SignatureVerdict } from '../src/index';

const fixtures = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../engine/main/test/fixtures/signature-long-term',
);

interface Observation {
  file: string;
  sha256: string;
  made: string;
  signatures: {
    field: string;
    /**
     * Acrobat's `signatureValidate()`: 4 is valid and trusted, 3 is unknown (the signer could
     * not be checked; the document is reported unmodified), 2 is invalid.
     */
    status: number;
    statusText: string;
  }[];
}

const observations: { cases: Observation[] } = JSON.parse(
  await readFile(resolve(fixtures, 'observations.json'), 'utf8'),
);

/**
 * Where the engine still reads `forbidden` and Acrobat reads valid. Each entry is a debt, not a
 * policy: when the engine learns to agree, the test below fails and the entry goes.
 */
const KNOWN_DIFFERENCES: { file: string; field: string; why: string }[] = [];
const knownDifference = (file: string, field: string) =>
  KNOWN_DIFFERENCES.some((entry) => entry.file === file && entry.field === field);

describe('validation data and document timestamps, as Acrobat judges them', () => {
  let engine: Engine;
  let opened = 0;

  beforeAll(() => {
    engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
  });
  afterAll(async () => {
    await engine.destroy();
  });

  async function withDocument<T>(file: string, body: (doc: DocumentHandle) => Promise<T>) {
    const bytes = new Uint8Array(await readFile(resolve(fixtures, file)));
    const doc = await engine.open({ kind: 'bytes', id: `long-term-${opened++}`, bytes });
    try {
      return await body(doc);
    } finally {
      await doc.close();
    }
  }

  const verdictOf = (verdicts: SignatureVerdict[], field: string): SignatureVerdict => {
    const verdict = verdicts.find((candidate) => candidate.signature.fieldName === field);
    expect(verdict, field).toBeDefined();
    return verdict!;
  };

  /** Every finding that isn't `permitted`, for the signature in `field`. */
  async function findings(doc: DocumentHandle, field: string) {
    const verdict = verdictOf(await validateSignatures(doc), field);
    const analysis = await doc.signatures!.analyze({
      since: { signatureIndex: verdict.signature.index },
      detail: 'full',
    });
    return analysis.steps.flatMap((step) => step.findings);
  }

  test.each(observations.cases)('$file', async (observed) => {
    const bytes = await readFile(resolve(fixtures, observed.file));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(observed.sha256);

    await withDocument(observed.file, async (doc) => {
      const verdicts = await validateSignatures(doc);
      expect(verdicts).toHaveLength(observed.signatures.length);
      for (const signature of observed.signatures) {
        const verdict = verdictOf(verdicts, signature.field);
        const where = `${observed.file} ${signature.field}: ${verdict.modifications.detail ?? ''}`;
        expect(verdict.integrity, where).toBe('valid');
        expect(verdict.cryptography, where).toBe('valid');
        if (signature.status === 2) {
          // Acrobat: "altered or corrupted since the certification was applied".
          expect(signature.statusText).toMatch(/altered/i);
          expect(verdict.modifications.verdict, where).toBe('forbidden');
        } else {
          // Valid, or unknown only because the signer could not be checked offline: either
          // way Acrobat reports nothing altered.
          expect([3, 4], where).toContain(signature.status);
          expect(signature.statusText, where).not.toMatch(/INVALID|has been altered|corrupted/);
          if (knownDifference(observed.file, signature.field)) {
            expect(verdict.modifications.verdict, where).toBe('forbidden');
          } else {
            expect(verdict.modifications.verdict, where).not.toBe('forbidden');
            expect(verdict.modifications.verdict, where).not.toBe('indeterminate');
          }
        }
      }
    });
  });

  test('the document timestamp Acrobat writes: /Annots moved into an object of its own', async () => {
    await withDocument('acrobat-lta.pdf', async (doc) => {
      const all = await findings(doc, 'sig');
      expect(all.filter((finding) => finding.verdict !== 'permitted')).toEqual([]);
      expect(
        all.some(
          (finding) =>
            finding.rule === 'signature-field-added' &&
            /moved into an object of its own/.test(finding.detail ?? ''),
        ),
      ).toBe(true);
    });
  });

  test('a list that is an object of its own grows there: a new signature field', async () => {
    for (const file of [
      'grow-acrobat-lta+second-timestamp.pdf',
      'grow-acrobat-lta+second-signature.pdf',
    ]) {
      await withDocument(file, async (doc) => {
        // The first timestamp sealed the revision in which the list already was object 30.
        const all = await findings(doc, 'Signature3');
        expect(all.filter((finding) => finding.verdict !== 'permitted')).toEqual([]);
        expect(all.find((finding) => finding.objectNumber === 30)).toMatchObject({
          rule: 'signature-field-added',
          verdict: 'permitted',
        });
      });
    }
  });

  test('a list that is an object of its own grows there: a comment, as Acrobat adds it', async () => {
    for (const file of ['acrobat-lta+acrobat-comment.pdf']) {
      await withDocument(file, async (doc) => {
        for (const field of ['sig', 'Signature3']) {
          const all = await findings(doc, field);
          expect(
            all.filter((finding) => finding.verdict !== 'permitted'),
            `${file} ${field}`,
          ).toEqual([]);
          expect(
            all.some((finding) => finding.rule === 'annotation' && finding.objectNumber === 30),
          ).toBe(true);
        }
      });
    }
  });

  test('a list replaced by another object, the old one left unwritten, is read from the file', async () => {
    expect(KNOWN_DIFFERENCES).toEqual([]);
    // Acrobat pointed the page at a new /Annots object and left the old one in the file. No
    // revision after the first timestamp wrote the old list, so the engine reads it from the
    // earlier revision's bytes to see that the new list kept every entry.
    await withDocument('acrobat-lta+acrobat-timestamp.pdf', async (doc) => {
      const found = await findings(doc, 'Signature3');
      expect(found.filter((finding) => finding.verdict !== 'permitted')).toEqual([]);
      // The page and its new list are explained by the field the timestamp added.
      expect(found.filter((finding) => finding.objectNumber === 3)).toEqual([
        expect.objectContaining({ rule: 'signature-field-added', verdict: 'permitted' }),
      ]);
      const verdicts = await validateSignatures(doc);
      expect(verdictOf(verdicts, 'Signature3').modifications.verdict).toBe('permitted');
      // The first signature sealed a revision whose list was still inside the page.
      expect(verdictOf(verdicts, 'sig').modifications.verdict).toBe('permitted');
    });
  });

  test('after a certification that allows no changes, validation data is a change', async () => {
    await withDocument('iso-p1+store-only.pdf', async (doc) => {
      const refused = (await findings(doc, 'sig')).filter(
        (finding) => finding.verdict === 'forbidden',
      );
      expect(refused.length).toBeGreaterThan(0);
      // One cause, named once per object: no cascade of unexplained references.
      expect(new Set(refused.map((finding) => finding.rule))).toEqual(
        new Set(['no-changes-certification']),
      );
      expect(refused[0].detail).toMatch(/Acrobat/);
    });
  });

  test('the same additions after a certification that allows form filling are allowed', async () => {
    await withDocument('iso-p2+store-only+timestamp-only.pdf', async (doc) => {
      const [certification, timestamp] = await validateSignatures(doc);
      expect(certification.modifications.verdict).toBe('permitted');
      expect(certification.signature.docMdp).toBe(2);
      expect(timestamp.signature.kind).toBe('timestamp');
      expect(timestamp.modifications.verdict).toBe('unchanged');
    });
  });

  test('after a certification that allows no changes, the engine writes nothing more', async () => {
    const refusal = async (attempt: () => Promise<unknown>) => {
      try {
        await attempt();
        return null;
      } catch (error) {
        return EngineError.is(error, EngineErrorCode.ProtectedDocument)
          ? 'ProtectedDocument'
          : error;
      }
    };
    await withDocument('ours-certified-p1-b-t.pdf', async (doc) => {
      expect(doc.security.allows('doc.sign')).toBe(false);
      expect(doc.security.allows('doc.metadata.modify')).toBe(false);
      // A document timestamp is a revision too: Acrobat would report the certification as altered.
      expect(
        await refusal(() =>
          doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' }, kind: 'timestamp' }),
        ),
      ).toBe('ProtectedDocument');
      expect(await refusal(() => doc.metadata.update({ title: 'Changed' }))).toBe(
        'ProtectedDocument',
      );
    });
    // A certification that allows form filling leaves both.
    await withDocument('iso-p2+store-only.pdf', async (doc) => {
      expect(doc.security.allows('doc.sign')).toBe(true);
      expect(doc.security.allows('doc.metadata.modify')).toBe(true);
    });
  });

  test('`signedDocumentPolicy: permit` still lets through what the standard allows', async () => {
    const permissive = createLocalEngine({
      runtime: { prefer: 'wasm' },
      signedDocumentPolicy: 'permit',
    });
    try {
      const bytes = new Uint8Array(await readFile(resolve(fixtures, 'ours-certified-p1-b-t.pdf')));
      const doc = await permissive.open({ kind: 'bytes', id: 'long-term-permit', bytes });
      expect(doc.security.allows('doc.sign')).toBe(true);
      await doc.close();
    } finally {
      await permissive.destroy();
    }
  });
});
