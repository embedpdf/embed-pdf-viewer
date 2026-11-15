/**
 * The folders of Acrobat reports that are not part of the role-probe corpus
 * (`compatibility-corpus.test.ts` holds that one): the morning variants, the pages signed over
 * inline annotations, the weak-annotation probes and the shared-font files. Their files were
 * judged by Acrobat once and then left without a test.
 *
 * `engine-baseline-diagnostic-sets.json` records the engine's answer on every signed file in
 * them and, where the folder's own result file has Acrobat's verdict, how the two relate. A
 * rule change that moves any answer fails here and has to edit the baseline on purpose.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '@embedpdf/engine';
import type { Engine } from '@embedpdf/engine-core/runtime';

import { validateSignatures, type ModificationsVerdict } from '../src/index';

const corpus = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../engine/main/test/fixtures/signature-compat',
);

type Relationship = 'agrees' | 'no-verdict' | 'more-lenient' | 'stricter';

interface RecordedSignature {
  field: string;
  integrity: string;
  cryptography: string;
  changes: ModificationsVerdict;
  /** Acrobat's verdict, when the folder's result file has one for this signature. */
  acrobat?: 'valid' | 'invalid';
  relationship?: Relationship;
}

const baseline: { files: { file: string; sha256: string; signatures: RecordedSignature[] }[] } =
  JSON.parse(await readFile(resolve(corpus, 'engine-baseline-diagnostic-sets.json'), 'utf8'));

/** How the engine's answer relates to Acrobat's verdict. */
function relationshipOf(
  acrobat: 'valid' | 'invalid',
  answer: Pick<RecordedSignature, 'integrity' | 'cryptography' | 'changes'>,
): Relationship {
  const sound = answer.integrity === 'valid' && answer.cryptography === 'valid';
  if (acrobat === 'valid') {
    if (sound && (answer.changes === 'unchanged' || answer.changes === 'permitted')) {
      return 'agrees';
    }
    return answer.changes === 'forbidden' ? 'stricter' : 'no-verdict';
  }
  if (answer.changes === 'forbidden' || !sound) return 'agrees';
  return answer.changes === 'indeterminate' ? 'no-verdict' : 'more-lenient';
}

describe('diagnostic Acrobat sets: the engine keeps answering what it answered', () => {
  let engine: Engine;
  let opened = 0;

  beforeAll(() => {
    engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
  });
  afterAll(async () => {
    await engine.destroy();
  });

  test('the baseline says how each recorded Acrobat verdict relates to the engine', () => {
    const counts: Record<string, number> = {};
    for (const file of baseline.files) {
      for (const signature of file.signatures) {
        if (!signature.acrobat) {
          expect(signature.relationship, file.file).toBeUndefined();
          continue;
        }
        expect(signature.relationship, file.file).toBe(
          relationshipOf(signature.acrobat, signature),
        );
        counts[signature.relationship!] = (counts[signature.relationship!] ?? 0) + 1;
      }
    }
    // 68 recorded verdicts. The 20 where Acrobat rejects and the engine doesn't are all
    // inline annotations in the signed revision; the 25 without a verdict are signed revisions
    // Acrobat cannot verify later changes against.
    expect(counts).toEqual({ agrees: 23, 'no-verdict': 25, 'more-lenient': 20 });
  });

  test.each(baseline.files)('$file', async (recorded) => {
    const bytes = new Uint8Array(await readFile(resolve(corpus, recorded.file)));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(recorded.sha256);
    const doc = await engine.open({ kind: 'bytes', id: `diagnostic-${opened++}`, bytes });
    try {
      const verdicts = await validateSignatures(doc);
      expect(
        verdicts.map((verdict) => ({
          field: verdict.signature.fieldName,
          integrity: verdict.integrity,
          cryptography: verdict.cryptography,
          changes: verdict.modifications.verdict,
        })),
      ).toEqual(
        recorded.signatures.map(({ field, integrity, cryptography, changes }) => ({
          field,
          integrity,
          cryptography,
          changes,
        })),
      );
    } finally {
      await doc.close();
    }
  });
});
