/**
 * Adversarial probes for the revision analysis, through the public API.
 * Every expectation is the correct verdict (ISO 32000-2 12.8.4 and the
 * edge-claim law), not the current behaviour: a probe that fails names a
 * defect. The first four are the external review's reproductions
 * (2026-09-11), with their expectations corrected.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '../src/index';
import {
  append,
  appendSignedExistingField,
  appendSignedField,
  lastObjectBody,
  pdf,
  type Objects,
} from './helpers/miniPdf';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, 'fixtures');

type Engine = Awaited<ReturnType<typeof createLocalEngine>>;
type Doc = Awaited<ReturnType<Engine['open']>>;
type Analysis = Awaited<ReturnType<NonNullable<Doc['signatures']>['analyze']>>;

/** A DER sequence; the analysis never verifies cryptography. */
const FAKE_CMS = new Uint8Array([0x30, 3, 2, 1, 1]);
const MIB = 1024 * 1024;

let engine: Engine;
let seq = 0;

beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

async function open(bytes: Uint8Array): Promise<Doc> {
  return engine.open({ kind: 'bytes', id: `adversarial-${++seq}`, bytes }, { scope: ['*'] });
}

/** Sign `fieldName` (certifying with `permission` when given) and return the sealed bytes. */
async function sign(
  bytes: Uint8Array,
  opts: {
    fieldName?: string;
    permission?: 1 | 2 | 3;
    lock?: { action: 'include'; fields: string[] };
    appearance?: Uint8Array;
  } = {},
): Promise<Uint8Array> {
  const doc = await open(bytes);
  try {
    const prepared = await doc.signatures.prepare({
      field: { kind: 'fqn', name: opts.fieldName ?? 'sig' },
      ...(opts.permission ? { certify: { permission: opts.permission } } : {}),
      ...(opts.lock ? { lock: opts.lock } : {}),
      ...(opts.appearance ? { appearance: { pdf: opts.appearance } } : {}),
    });
    await doc.signatures.complete({
      signingId: prepared.signingId,
      expectedVersion: prepared.expectedVersion,
      cms: FAKE_CMS,
    });
    return new Uint8Array(await doc.download());
  } finally {
    await doc.close();
  }
}

const findings = (a: Analysis) => a.steps.flatMap((s) => s.findings);

/** `DUMP_ANALYSIS=1` prints every analysis (verdict, level, objects, findings) for debugging. */
async function analyze(
  bytes: Uint8Array,
  since: { signatureIndex: number } | { revisionIndex: number } = { signatureIndex: 0 },
): Promise<Analysis> {
  const doc = await open(bytes);
  try {
    return dump(await doc.signatures.analyze({ since }));
  } finally {
    await doc.close();
  }
}

function dump(a: Analysis): Analysis {
  if (process.env.DUMP_ANALYSIS) {
    console.log(
      JSON.stringify({
        verdict: a.verdict,
        steps: a.steps.map((s) => ({
          level: s.levelInForce,
          verdict: s.verdict,
          changes: s.changes.map((c) => ({
            n: c.objectNumber,
            ch: c.change,
            usage: c.usage,
            truncated: c.value.truncated,
            ...(process.env.DUMP_ANALYSIS === '2' ? { raw: c.raw } : {}),
          })),
          fields: process.env.DUMP_ANALYSIS === '2' ? { locks: s.locks } : undefined,
          findings: s.findings,
        })),
      }),
    );
  }
  return a;
}

// ---------------------------------------------------------------------------
// Fixture builders: catalog 1, pages 2, page 3, AcroForm 10, signature field 30.
// ---------------------------------------------------------------------------

const CATALOG = '/Type /Catalog /Pages 2 0 R /AcroForm 10 0 R';
const SIG_FIELD =
  '<< /Type /Annot /Subtype /Widget /FT /Sig /T (sig) /Rect [10 10 100 40] /P 3 0 R >>';
const page = (annots: number[]) =>
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Annots [${annots.map((n) => `${n} 0 R`).join(' ')}] /Resources <<>> >>`;
const acroForm = (fields: number[]) => `<< /Fields [${fields.map((n) => `${n} 0 R`).join(' ')}] >>`;
const textField = (v: string, extra = '') =>
  `<< /Type /Annot /Subtype /Widget /FT /Tx /T (text) /V (${v}) /Rect [20 60 180 80] /P 3 0 R${extra} >>`;
const formStream = (content: string) =>
  `<< /Type /XObject /Subtype /Form /BBox [0 0 160 20] /Resources <<>> /Length ${content.length} >>\nstream\n${content}\nendstream`;

function document(objects: Objects, catalogExtra = ''): Uint8Array {
  return pdf({
    1: `<< ${CATALOG}${catalogExtra} >>`,
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    ...objects,
  });
}

/**
 * A tagged page the way Chrome and Word write one: a structure tree
 * (Document > sections > paragraphs) whose elements point at their parent
 * (/P), their children (/K) and the page (/Pg), with a parent tree from the
 * page's marked content back to the paragraphs. Root 40, Document 41,
 * parent tree 44, its array 45; elements from 100. `/A` on the first
 * paragraph points at `attribute` (object 46) when given.
 */
function taggedDocument(annots: number[], attribute?: string): Uint8Array {
  const objects: Objects = {
    3: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Annots [${annots.map((n) => `${n} 0 R`).join(' ')}] /Resources <<>> /Contents 5 0 R /StructParents 0 /Tabs /S >>`,
    10: acroForm([30]),
    30: SIG_FIELD,
    40: '<< /Type /StructTreeRoot /K 41 0 R /ParentTree 44 0 R /ParentTreeNextKey 1 >>',
    44: '<< /Nums [0 45 0 R] >>',
  };
  if (attribute) objects[46] = attribute;
  const sections: number[] = [];
  const paragraphs: number[] = [];
  let content = '';
  let next = 100;
  for (let s = 0; s < 6; s++) {
    const section = next++;
    const kids: number[] = [];
    for (let p = 0; p < 6; p++) {
      const paragraph = next++;
      const mcid = paragraphs.length;
      const a = attribute && mcid === 0 ? ' /A 46 0 R' : '';
      objects[paragraph] =
        `<< /Type /StructElem /S /P /P ${section} 0 R /Pg 3 0 R /K [<< /Type /MCR /Pg 3 0 R /MCID ${mcid} >>]${a} >>`;
      content += `/P <</MCID ${mcid}>> BDC 72 ${700 - mcid * 12} m 300 ${700 - mcid * 12} l S EMC\n`;
      kids.push(paragraph);
      paragraphs.push(paragraph);
    }
    objects[section] =
      `<< /Type /StructElem /S /Sect /P 41 0 R /Pg 3 0 R /K [${kids.map((n) => `${n} 0 R`).join(' ')}] >>`;
    sections.push(section);
  }
  objects[41] = `<< /Type /StructElem /S /Document /P 40 0 R /Pg 3 0 R /K [${sections.map((n) => `${n} 0 R`).join(' ')}] >>`;
  objects[45] = `[${paragraphs.map((n) => `${n} 0 R`).join(' ')}]`;
  objects[5] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;
  return document(objects, ' /StructTreeRoot 40 0 R /MarkInfo << /Marked true >>');
}

const SQUARE =
  '<< /Type /Annot /Subtype /Square /Rect [50 50 150 110] /C [1 0 0] /P 3 0 R /AP << /N 61 0 R >> >>';

// ---------------------------------------------------------------------------

describe('analysis: evidence must never fail open', () => {
  test('a changed /OpenAction under P=1 is forbidden alone AND next to a DSS update', async () => {
    const base = document(
      {
        3: page([30]),
        9: '<< /S /JavaScript /JS (var example = 1;) >>',
        10: acroForm([30]),
        30: SIG_FIELD,
        50: '<< /Certs [] >>',
      },
      ' /OpenAction 9 0 R /DSS 50 0 R',
    );
    const signed = await sign(base, { permission: 1 });
    const changed: Objects = { 9: '<< /S /JavaScript /JS (var example = 2;) >>' };

    const alone = await analyze(append(signed, changed));
    expect(alone.verdict).toBe('forbidden');

    const withDss = await analyze(append(signed, { ...changed, 50: '<< /Certs [] /VRI <<>> >>' }));
    expect(withDss.verdict).toBe('forbidden');
    expect(
      findings(withDss).some(
        (f) => f.objectNumber === 50 && f.rule === 'dss' && f.verdict === 'permitted',
      ),
    ).toBe(true);
    expect(findings(withDss).some((f) => f.objectNumber === 9 && f.verdict === 'forbidden')).toBe(
      true,
    );
  });

  test('a catalog too large to inspect is indeterminate, never permitted', async () => {
    const padding = 'x'.repeat(MIB + 100);
    const base = document(
      {
        3: page([30]),
        9: '<< /S /JavaScript /JS (var example = 1;) >>',
        10: acroForm([30]),
        30: SIG_FIELD,
      },
      ` /OpenAction 9 0 R /Padding (${padding})`,
    );
    const signed = await sign(base, { permission: 1 });
    const root = lastObjectBody(signed, 1);
    expect(root).toContain('/Padding');
    const tampered = root.replace(
      /\/OpenAction\s*9 0 R/,
      '/OpenAction << /S /JavaScript /JS (var example = 2;) >>',
    );
    expect(tampered).not.toBe(root);

    const analysis = await analyze(append(signed, { 1: tampered }));
    expect(analysis.verdict).toBe('indeterminate');
    expect(analysis.steps[0].changes.find((c) => c.objectNumber === 1)?.value.truncated).toBe(true);
    expect(findings(analysis).some((f) => f.objectNumber === 1 && f.verdict === 'incomplete')).toBe(
      true,
    );
  });

  test('an AcroForm dictionary too large to inspect is indeterminate', async () => {
    const base = document({ 3: page([30]), 10: acroForm([30]), 30: SIG_FIELD });
    const signed = await sign(base, { permission: 2 });
    const analysis = await analyze(
      append(signed, { 10: `<< /Fields [30 0 R] /Padding (${'y'.repeat(MIB + 100)}) >>` }),
    );
    expect(analysis.verdict).toBe('indeterminate');
  });

  test('a trailer too large to inspect is indeterminate', async () => {
    const base = document(
      { 3: page([30]), 10: acroForm([30]), 30: SIG_FIELD, 50: '<< /Certs [] >>' },
      ' /DSS 50 0 R',
    );
    const signed = await sign(base, { permission: 2 });
    // One permitted object change (a DSS update) so the update carries an
    // xref section; the trailer gains a huge key. The change must be a real,
    // permitted one: a violation elsewhere would decide the step on its own.
    const analysis = await analyze(
      append(signed, { 50: '<< /Certs [] /VRI << >> >>' }, `/Padding (${'z'.repeat(MIB + 100)})`),
    );
    expect(analysis.verdict).toBe('indeterminate');
    expect(findings(analysis).some((f) => f.objectNumber === 0 && f.verdict === 'incomplete')).toBe(
      true,
    );
  });

  test('a widget action changed next to a legitimate fill is forbidden (no laundering through the fill subtree)', async () => {
    const base = document({
      3: page([20, 30]),
      10: acroForm([20, 30]),
      20: textField('a', ' /AP << /N 23 0 R >> /A 24 0 R'),
      23: formStream('q Q'),
      24: '<< /S /JavaScript /JS (app.alert(1);) >>',
      30: SIG_FIELD,
    });
    const signed = await sign(base, { permission: 2 });
    const analysis = await analyze(
      append(signed, {
        20: textField('b', ' /AP << /N 23 0 R >> /A 24 0 R'),
        23: formStream('q 0.5 g Q'),
        24: '<< /S /JavaScript /JS (app.alert(2);) >>',
      }),
    );
    expect(analysis.verdict).toBe('forbidden');
    expect(findings(analysis).some((f) => f.objectNumber === 24 && f.verdict === 'forbidden')).toBe(
      true,
    );
    expect(findings(analysis).some((f) => f.objectNumber === 20 && f.verdict === 'permitted')).toBe(
      true,
    );
  });

  test('a change hanging off a structure tree is judged, not lost in its loops', async () => {
    // The structure tree is one loop of unchanged objects (/P up, /K down,
    // the parent tree across). An attribute object under a paragraph,
    // changed after an approval signature, is reached through it, and no
    // rule explains it: forbidden, with the way in and out kept.
    const attribute = (placement: string) => `<< /O /Layout /Placement /${placement} >>`;
    const signed = await sign(taggedDocument([30], attribute('Block')));
    const analysis = await analyze(append(signed, { 46: attribute('Inline') }));
    expect(analysis.verdict).toBe('forbidden');
    const changed = analysis.steps[0].changes.find((c) => c.objectNumber === 46)!;
    expect(changed.usageIncomplete).toBeUndefined();
    expect(changed.usage.new.map((e) => `${e.parent}:${e.label}`)).toEqual([
      '1:StructTreeRoot/…/A',
    ]);
    expect(findings(analysis).some((f) => f.objectNumber === 46 && f.verdict === 'forbidden')).toBe(
      true,
    );
  });

  test('a shared appearance dictionary: filling one field does not explain the other widget', async () => {
    const other = (v: string) =>
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T (other) /V (${v}) /Rect [20 90 180 110] /P 3 0 R /AP 22 0 R >>`;
    const base = document({
      3: page([20, 40, 30]),
      10: acroForm([20, 40, 30]),
      20: textField('a', ' /AP 22 0 R'),
      22: '<< /N 23 0 R >>',
      23: formStream('q Q'),
      30: SIG_FIELD,
      40: other('x'),
    });
    const signed = await sign(base, { permission: 2 });
    const analysis = await analyze(
      append(signed, { 20: textField('b', ' /AP 22 0 R'), 23: formStream('q 0.5 g Q') }),
    );
    expect(analysis.verdict).toBe('forbidden');
    expect(findings(analysis).some((f) => f.objectNumber === 23 && f.verdict === 'forbidden')).toBe(
      true,
    );
  });
});

describe('analysis: legitimate changes must not fail closed', () => {
  test('a fill whose appearance stream sits under an UNCHANGED indirect /AP dictionary is permitted under P=2', async () => {
    const base = document({
      3: page([20, 30]),
      10: acroForm([20, 30]),
      20: textField('a', ' /AP 22 0 R'),
      22: '<< /N 23 0 R >>',
      23: formStream('q Q'),
      30: SIG_FIELD,
    });
    const signed = await sign(base, { permission: 2 });
    const analysis = await analyze(
      append(signed, { 20: textField('b', ' /AP 22 0 R'), 23: formStream('q 0.5 g Q') }),
    );
    expect(analysis.verdict).toBe('permitted');
    const stream = analysis.steps[0].changes.find((c) => c.objectNumber === 23)!;
    expect(stream.usage.new.map((e) => `${e.parent}:${e.label}`)).toEqual(['20:AP/N']);
  });

  test('an appearance regenerated under an untouched field and widget is form filling under P=2 (pyHanko agrees), forbidden under P=1', async () => {
    const build = () =>
      document({
        3: page([20, 30]),
        10: acroForm([20, 30]),
        20: textField('a', ' /AP 22 0 R'),
        22: '<< /N 23 0 R >>',
        23: formStream('q Q'),
        30: SIG_FIELD,
      });
    const fill = await analyze(
      append(await sign(build(), { permission: 2 }), { 23: formStream('q 0.5 g Q') }),
    );
    expect(fill.verdict).toBe('permitted');
    expect(
      findings(fill).some(
        (f) => f.objectNumber === 23 && f.rule === 'form-fill' && f.verdict === 'permitted',
      ),
    ).toBe(true);
    const lta = await analyze(
      append(await sign(build(), { permission: 1 }), { 23: formStream('q 0.5 g Q') }),
    );
    expect(lta.verdict).toBe('forbidden');
  });

  test('an appearance regenerated for a field is still bounded by the subtree: a foreign edge stays unexplained', async () => {
    const base = document(
      {
        3: page([20, 30]),
        10: acroForm([20, 30]),
        20: textField('a', ' /AP 22 0 R'),
        22: '<< /N 23 0 R /D 24 0 R >>',
        23: formStream('q Q'),
        24: formStream('q Q'),
        30: SIG_FIELD,
      },
      ' /OpenAction 24 0 R',
    );
    const signed = await sign(base, { permission: 2 });
    // 24 hangs off the widget's /AP/D but is also the catalog's /OpenAction: the second edge is nobody's.
    const analysis = await analyze(append(signed, { 24: formStream('q 1 0 0 rg Q') }));
    expect(analysis.verdict).toBe('forbidden');
  });

  test('adding a signature field and signing it in one revision is permitted under P=2', async () => {
    const base = document({ 3: page([30]), 10: acroForm([30]), 30: SIG_FIELD });
    const signed = await sign(base, { permission: 2 });
    const bytes = appendSignedField(signed, {
      fieldNum: 60,
      valueNum: 61,
      name: 'sig2',
      pageAnnots: [30, 60],
      acroFields: [30, 60],
    });

    const doc = await open(bytes);
    try {
      const snapshot = await doc.signatures.list();
      expect(snapshot.signatures[1].coverage).toBe('whole-revision');
      const analysis = await doc.signatures.analyze({ since: { signatureIndex: 0 } });
      expect(analysis.verdict).toBe('permitted');
      expect(findings(analysis).filter((f) => f.verdict !== 'permitted')).toEqual([]);
    } finally {
      await doc.close();
    }
  });

  test('adding a signature field with an indirect /Lock and signing it in one revision is permitted under P=2', async () => {
    const base = document({
      3: page([20, 30]),
      10: acroForm([20, 30]),
      20: textField('a'),
      30: SIG_FIELD,
    });
    const signed = await sign(base, { permission: 2 });
    const bytes = appendSignedField(signed, {
      fieldNum: 60,
      valueNum: 61,
      name: 'sig2',
      pageAnnots: [20, 30, 60],
      acroFields: [20, 30, 60],
      extraField: '/Lock 63 0 R',
      extraObjects: { 63: '<< /Type /SigFieldLock /Action /Include /Fields [(text)] >>' },
    });
    const analysis = await analyze(bytes);
    expect(analysis.verdict).toBe('permitted');
    expect(findings(analysis).some((f) => f.objectNumber === 63 && f.verdict === 'permitted')).toBe(
      true,
    );
  });

  // Commenting after an approval signature keeps it valid in Acrobat (corpus
  // v3/88). A tagged page changes the same objects: its structure tree points
  // at the page (/Pg) from every element, but none of it changes, and Acrobat
  // compares revisions object by object (signature-compat/TAGGED-DOCUMENTS.md).
  // Most PDFs are tagged (Chrome, Word); these read `indeterminate` while the
  // resolver walked every path through the tree's loops.
  test('a comment added to a tagged page after an approval signature is permitted', async () => {
    const signed = await sign(taggedDocument([30]));
    const analysis = await analyze(
      append(signed, {
        3: lastObjectBody(signed, 3).replace('/Annots [30 0 R]', '/Annots [30 0 R 60 0 R]'),
        60: SQUARE,
        61: formStream('1 0 0 RG 2 w 1 1 98 58 re S'),
      }),
    );
    expect(analysis.verdict).toBe('permitted');
    expect(findings(analysis).filter((f) => f.verdict !== 'permitted')).toEqual([]);
    const page = analysis.steps[0].changes.find((c) => c.objectNumber === 3)!;
    for (const side of ['old', 'new'] as const) {
      expect(page.usage[side].map((e) => `${e.parent}:${e.label}`)).toContain(
        '1:StructTreeRoot/…/Pg',
      );
    }
  });

  test('our own comment on a tagged page after an approval signature is permitted, unsaved and saved', async () => {
    const signed = await sign(taggedDocument([30]));
    const doc = await open(signed);
    try {
      const page = (await doc.pages.list()).pages[0]!;
      await doc.page(page.ref).annotations.create({
        subtype: 'square',
        rect: { x: 50, y: 50, width: 100, height: 60 },
        color: '#ff0000',
        strokeWidth: 2,
      } as never);
      const working = dump(
        await doc.signatures.analyze({ since: { signatureIndex: 0 }, until: 'working-copy' }),
      );
      expect(working.verdict).toBe('permitted');
      const persisted = await analyze(new Uint8Array(await doc.download()));
      expect(persisted.verdict).toBe('permitted');
    } finally {
      await doc.close();
    }
  });
});

describe('analysis: our own signing output is judged permitted', () => {
  let unsigned: Uint8Array;
  let artwork: Uint8Array;
  beforeAll(async () => {
    unsigned = new Uint8Array(await readFile(resolve(fixtures, 'unsigned_sigfield.pdf')));
    artwork = new Uint8Array(await readFile(resolve(fixtures, 'signature_artwork.pdf')));
  });

  test('a signature with a field lock and an appearance', async () => {
    const signed = await sign(unsigned, {
      lock: { action: 'include', fields: ['group.total'] },
      appearance: artwork,
    });
    const analysis = await analyze(signed, { revisionIndex: 0 });
    expect(analysis.steps.length).toBeGreaterThan(0);
    expect(analysis.verdict).toBe('permitted');
  });

  test('a signature with a field lock and no appearance', async () => {
    const signed = await sign(unsigned, { lock: { action: 'include', fields: ['group.total'] } });
    const analysis = await analyze(signed, { revisionIndex: 0 });
    expect(analysis.steps.length).toBeGreaterThan(0);
    expect(analysis.verdict).toBe('permitted');
  });

  test('a certification followed by a fill in a layer save', async () => {
    const signed = await sign(unsigned, { permission: 2 });
    const doc = await open(signed);
    try {
      await doc.forms.setValue({ kind: 'fqn', name: 'group.total' }, { value: '42' });
      const working = await doc.signatures.analyze({
        since: { signatureIndex: 0 },
        until: 'working-copy',
      });
      expect(working.verdict).toBe('permitted');
      const persisted = await analyze(new Uint8Array(await doc.download()));
      expect(persisted.verdict).toBe('permitted');
    } finally {
      await doc.close();
    }
  });
});

describe('analysis: /Lock on an existing field is authoring-time only', () => {
  const twoSigFields = () =>
    document({
      3: page([20, 30, 31]),
      10: acroForm([20, 30, 31]),
      20: textField('a'),
      30: SIG_FIELD,
      31: '<< /Type /Annot /Subtype /Widget /FT /Sig /T (sig2) /Rect [110 10 200 40] /P 3 0 R >>',
    });

  test('a second signature that adds /Lock to its existing field under a certification is forbidden (pyHanko, Acrobat)', async () => {
    const certified = await sign(twoSigFields(), { permission: 2 });
    const bytes = appendSignedExistingField(certified, {
      fieldNum: 31,
      valueNum: 61,
      fieldDict:
        '<< /Type /Annot /Subtype /Widget /FT /Sig /T (sig2) /Rect [110 10 200 40] /P 3 0 R /Lock 63 0 R >>',
      extraObjects: { 63: '<< /Type /SigFieldLock /Action /Include /Fields [(text)] >>' },
    });
    const analysis = await analyze(bytes);
    expect(analysis.verdict).toBe('forbidden');
    expect(
      findings(analysis).find((f) => f.objectNumber === 31 && f.verdict === 'forbidden')?.detail,
    ).toContain('Lock');
    expect(findings(analysis).filter((f) => f.verdict === 'forbidden')).toHaveLength(1);
  });

  test('our own second signature with a lock writes the FieldMDP only, and is judged permitted', async () => {
    const certified = await sign(twoSigFields(), { permission: 2 });
    const signed = await sign(certified, {
      fieldName: 'sig2',
      lock: { action: 'include', fields: ['text'] },
    });
    const doc = await open(signed);
    try {
      const snapshot = await doc.signatures.list();
      const second = snapshot.signatures.find((s) => s.fieldName === 'sig2')!;
      expect(second.fieldMdp).toEqual({ action: 'include', fields: ['text'] });
      expect(second.lock).toBeNull();
      expect(snapshot.protection.fieldLocks.some((l) => lockNames(l.spec).includes('text'))).toBe(
        true,
      );
      const analysis = dump(await doc.signatures.analyze({ since: { signatureIndex: 0 } }));
      expect(analysis.verdict).toBe('permitted');
    } finally {
      await doc.close();
    }
  });

  test('the first signature on a document still mirrors its lock on the field', async () => {
    const signed = await sign(twoSigFields(), { lock: { action: 'include', fields: ['text'] } });
    const doc = await open(signed);
    try {
      const first = (await doc.signatures.list()).signatures.find((s) => s.fieldName === 'sig')!;
      expect(first.lock).toEqual({ action: 'include', fields: ['text'] });
    } finally {
      await doc.close();
    }
  });
});

function lockNames(spec: { action: string; fields?: string[] }): string[] {
  return spec.fields ?? [];
}
