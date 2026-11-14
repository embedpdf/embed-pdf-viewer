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
    /** Acrobat's `signatureValidate()`: 4 is valid and trusted, 2 is invalid. */
    status: number;
    statusText: string;
  }[];
}

const observations: { cases: Observation[] } = JSON.parse(
  await readFile(resolve(fixtures, 'observations.json'), 'utf8'),
);

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
          expect(signature.status, where).toBe(4);
          expect(verdict.modifications.verdict, where).not.toBe('forbidden');
          expect(verdict.modifications.verdict, where).not.toBe('indeterminate');
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
