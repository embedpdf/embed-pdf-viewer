import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { BANDS_PNG, PICTURE_BUTTON_PDF } from '@embedpdf/engine-core/conformance';
import {
  toPageRef,
  type DocumentHandle,
  type FormFieldRef,
  type ChangeAnalysis,
} from '@embedpdf/engine-core/runtime';
import { createLocalEngine, type LocalEngine } from '../src/index';

/**
 * What the change analysis says of an image set in a push button after
 * someone else signed, after an approval signature and after a
 * certification for form filling: filling in, permitted, as Acrobat 26 says
 * of the same files (checked Nov 26 2026). A mark drawn into an unsigned
 * signature field is permitted too: its widget's dictionary is not written,
 * only a new appearance, which neither the analysis nor Acrobat counts
 * against the signature. The rules are `signature/analysis/evaluate.ts`;
 * a locked button and a caption or layout change are unit tests there
 * (`test/signature/analysis.test.ts`), since the engine refuses those
 * writes.
 *
 * With `PICTURE_ANALYSIS_OUT` set to a folder, each case's file is written
 * there, for a check in Acrobat.
 */

const named = (name: string): FormFieldRef => ({ kind: 'fqn', name });
const PAGE = toPageRef(3);
/** A DER `SEQUENCE`: the local engine completes a signing with it, without judging it. */
const PLACEHOLDER_CMS = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);

type Level = 'approval' | 'certification';

let engine: LocalEngine;
let opened = 0;

beforeAll(async () => {
  engine = await createLocalEngine();
});

afterAll(async () => {
  await engine.destroy();
});

/** The fixture written whole once, as a PDF app saves it: a revision a signature can seal. */
let base: Uint8Array;

beforeAll(async () => {
  const doc = await engine.open(
    { kind: 'bytes', id: `picture-analysis-${opened++}`, bytes: PICTURE_BUTTON_PDF.slice() },
    { scope: ['*'] },
  );
  try {
    base = await doc.download({ mode: 'rewrite' });
  } finally {
    await doc.close();
  }
});

/** A copy of the fixture, signed in `sig_field`: approved, or certified for form filling (P=2). */
async function signed(level: Level): Promise<DocumentHandle> {
  const doc = await engine.open(
    { kind: 'bytes', id: `picture-analysis-${opened++}`, bytes: base.slice() },
    { scope: ['*'] },
  );
  // A push button our engine made, before the signature: its field and widget apart.
  await doc.forms.create({
    kind: 'pushbutton',
    name: 'made_initials',
    widgets: [{ page: PAGE, box: { x: 300, y: 40, width: 90, height: 30 }, layout: 'image' }],
  });
  await doc.forms.create({
    kind: 'signature',
    name: 'second_signature',
    widgets: [{ page: PAGE, box: { x: 300, y: 100, width: 90, height: 30 } }],
  });
  const prepared = await doc.signatures.prepare({
    field: named('sig_field'),
    ...(level === 'certification' ? { certify: { permission: 2 } } : {}),
  });
  await doc.signatures.complete({
    signingId: prepared.signingId,
    cms: PLACEHOLDER_CMS,
    expectedVersion: prepared.expectedVersion,
  });
  return doc;
}

/** The verdict on the saved file since the signature, with the rules of every finding that isn't permitted. */
async function judged(doc: DocumentHandle, file: string) {
  const bytes = await doc.download();
  const out = process.env.PICTURE_ANALYSIS_OUT;
  if (out) {
    await mkdir(out, { recursive: true });
    await writeFile(join(out, `${file}.pdf`), bytes);
  }
  const reopened = await engine.open(
    { kind: 'bytes', id: `picture-analysis-${opened++}`, bytes },
    { scope: ['*'] },
  );
  try {
    // The fixture has two signature fields; the signed one is the one that seals a revision.
    const { signatures } = await reopened.signatures.list();
    const signatureIndex = signatures.findIndex((s) => s.coverage === 'whole-revision');
    const analysis: ChangeAnalysis = await reopened.signatures.analyze({
      since: { signatureIndex },
    });
    const findings = analysis.steps.flatMap((step) => step.findings);
    return {
      verdict: analysis.verdict,
      primary: analysis.current.primary
        ? `${analysis.current.primary.rule}: ${analysis.current.primary.verdict}`
        : null,
      notPermitted: findings
        .filter((finding) => finding.verdict !== 'permitted')
        .map((finding) => `${finding.rule}${finding.edge ? ` ${finding.edge}` : ''}`),
    };
  } finally {
    await reopened.close();
  }
}

describe('an image set after another signature, as the analysis judges it', () => {
  const cases: readonly [
    file: string,
    level: Level,
    what: string,
    write: (doc: DocumentHandle) => Promise<unknown>,
  ][] = [
    [
      'approval-image-field',
      'approval',
      "an image in the standard's image field (field and widget one)",
      (doc) => doc.forms.setButtonImage(named('layout_1'), BANDS_PNG),
    ],
    [
      'approval-made-button',
      'approval',
      'an image in a button the engine made (field and widget apart)',
      (doc) => doc.forms.setButtonImage(named('made_initials'), BANDS_PNG),
    ],
    [
      'approval-mark',
      'approval',
      'a mark drawn into an unsigned signature field',
      (doc) => doc.forms.setSignatureAppearance(named('second_signature'), BANDS_PNG),
    ],
    [
      'certified-fill-image-field',
      'certification',
      "an image in the standard's image field",
      (doc) => doc.forms.setButtonImage(named('layout_1'), BANDS_PNG),
    ],
    [
      'certified-fill-made-button',
      'certification',
      'an image in a button the engine made',
      (doc) => doc.forms.setButtonImage(named('made_initials'), BANDS_PNG),
    ],
    [
      'certified-fill-mark',
      'certification',
      'a mark drawn into an unsigned signature field',
      (doc) => doc.forms.setSignatureAppearance(named('second_signature'), BANDS_PNG),
    ],
    [
      'certified-fill-text',
      'certification',
      'a value typed into a text field (the control)',
      (doc) => doc.forms.setValue(named('text_field'), { value: 'filled' }),
    ],
  ];

  const found: Record<string, unknown> = {};

  for (const [file, level, what, write] of cases) {
    test(`after ${level === 'approval' ? 'an approval signature' : 'a certification for form filling'}: ${what}`, async () => {
      const doc = await signed(level);
      try {
        await write(doc);
        found[file] = await judged(doc, file);
      } finally {
        await doc.close();
      }
    });
  }

  test('what the analysis says, case by case', () => {
    console.info(JSON.stringify(found, null, 2));
    // The control: a value typed in under a certification for form filling.
    expect(found['certified-fill-text']).toMatchObject({ verdict: 'permitted', notPermitted: [] });
    // An image, at both levels and in both kinds of button: filling in. The
    // widget's `/MK /I` names the new drawing, and its subtree is claimed with
    // the appearance that draws it.
    for (const file of [
      'approval-image-field',
      'approval-made-button',
      'certified-fill-image-field',
      'certified-fill-made-button',
    ]) {
      expect(found[file], file).toMatchObject({ verdict: 'permitted', notPermitted: [] });
    }
    // A mark, at both levels: a new appearance on an unsigned signature field,
    // with nothing written into its widget's dictionary.
    for (const file of ['approval-mark', 'certified-fill-mark']) {
      expect(found[file], file).toMatchObject({ verdict: 'permitted', notPermitted: [] });
    }
  });
});
