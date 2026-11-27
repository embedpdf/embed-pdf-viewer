import { describe, expect, test } from 'vitest';
import {
  changedKeys,
  evaluateStep,
  parsePdfValue,
  restrictionsFor,
  restrictionsOf,
  stableStringify,
  type ObjectChange,
  type ObjectReferrer,
  type PdfCoordinates,
  type RevisionStructure,
  type Signature,
  type UnwrittenObject,
  unwrittenObjectsToRead,
} from '../../src/shared';

describe("parsePdfValue: the fork's shallow serialisation", () => {
  test('dictionaries, arrays, refs, names, strings, numbers, booleans, null, streams', () => {
    const v = parsePdfValue(
      '<</A 1/B [2 0 R 3 -4.5 true null]/C (hi \\(there\\))/D /Na#20me/E <</F 6 0 R>>>>',
    );
    expect(v).toEqual({
      t: 'dict',
      entries: {
        A: { t: 'number', v: 1 },
        B: {
          t: 'array',
          items: [
            { t: 'ref', num: 2 },
            { t: 'number', v: 3 },
            { t: 'number', v: -4.5 },
            { t: 'bool', v: true },
            { t: 'null' },
          ],
        },
        C: { t: 'string', v: 'hi (there)' },
        D: { t: 'name', v: 'Na me' },
        E: { t: 'dict', entries: { F: { t: 'ref', num: 6 } } },
      },
    });
    const s = parsePdfValue('stream(12,abcd)<</Length 12/Type /XObject>>');
    expect(s).toEqual({
      t: 'stream',
      length: 12,
      sha256: 'abcd',
      dict: { Length: { t: 'number', v: 12 }, Type: { t: 'name', v: 'XObject' } },
    });
    expect(stableStringify(v)).toBe(stableStringify(parsePdfValue(stableStringify(v))));
    expect(
      [...changedKeys(parsePdfValue('<</A 1/B 2>>'), parsePdfValue('<</A 1/B 3/C 4>>'))].sort(),
    ).toEqual(['B', 'C']);
  });
});

// ---------------------------------------------------------------------------

const edge = (parent: number, label: string, via?: number[]): ObjectReferrer =>
  via ? { parent, label, via } : { parent, label };

function change(
  objectNumber: number,
  raw: { old: string | null; new: string | null },
  usage: { old?: ObjectReferrer[]; new?: ObjectReferrer[] },
  extra: Partial<ObjectChange> = {},
): ObjectChange {
  const kindOf = (s: string | null) =>
    s === null
      ? null
      : s.startsWith('stream(')
        ? 'stream'
        : s.startsWith('<<')
          ? 'dictionary'
          : s.startsWith('[')
            ? 'array'
            : 'scalar';
  return {
    objectNumber,
    change: raw.old === null ? 'added' : raw.new === null ? 'freed' : 'modified',
    kind:
      objectNumber === 0
        ? 'trailer'
        : ((kindOf(raw.new ?? raw.old) ?? 'scalar') as ObjectChange['kind']),
    present: { old: raw.old !== null, new: raw.new !== null },
    generation: {
      old: raw.old === null || objectNumber === 0 ? null : 0,
      new: raw.new === null || objectNumber === 0 ? null : 0,
    },
    value: {
      old: raw.old === null ? null : parsePdfValue(raw.old),
      new: raw.new === null ? null : parsePdfValue(raw.new),
      truncated: false,
    },
    raw,
    streamDataChanged: false,
    usage: { old: usage.old ?? [], new: usage.new ?? [] },
    ...extra,
  };
}

function signature(
  index: number,
  fieldObjectNumber: number,
  extra: Partial<Signature> = {},
): Signature {
  return {
    index,
    field: { kind: 'objectNumber', objectNumber: fieldObjectNumber },
    fieldName: `sig${index}`,
    widget: null,
    signed: true,
    kind: 'signature',
    filter: 'Adobe.PPKLite',
    subFilter: 'ETSI.CAdES.detached',
    byteRange: [0, 100, 200, 100],
    contentsSizeBytes: 8,
    coverage: 'whole-revision',
    revisionIndex: 1,
    signer: { name: null, reason: null, location: null, contactInfo: null, signedAt: null },
    docMdp: null,
    catalogCertification: false,
    fieldMdp: null,
    lock: null,
    seedValue: null,
    ...extra,
  };
}

/** Catalog 1, pages 2, page 3, AcroForm 10, text field 20 (widget 21), signature field 30 (merged widget). */
function structure(overrides: Partial<RevisionStructure> = {}): RevisionStructure {
  return {
    root: 1,
    acroForm: 10,
    pagesRoot: 2,
    pages: [3],
    fields: [
      { objectNumber: 20, name: 'name', kind: 'text', widgets: [21] },
      { objectNumber: 30, name: 'sig0', kind: 'signature', widgets: [30] },
    ],
    signatures: [signature(0, 30)],
    ...overrides,
  };
}

const NO_CHANGES: ObjectChange[] = [];

describe('evaluateStep: the edge-claim law', () => {
  test('restrictions come from the older revision: approval baseline, certification, locks', () => {
    // Nothing signed: nothing forbids. An approval signature: judged the way
    // Acrobat reads it — form fill-in, signing and commenting keep it.
    expect(restrictionsOf(structure({ signatures: [] })).level).toBe('annotate');
    expect(restrictionsOf(structure()).level).toBe('annotate');
    expect(
      restrictionsOf(
        structure({ signatures: [signature(0, 30, { docMdp: 2, catalogCertification: true })] }),
      ).level,
    ).toBe('fill');
    const locked = restrictionsOf(
      structure({
        signatures: [signature(0, 30, { fieldMdp: { action: 'include', fields: ['name'] } })],
      }),
    );
    expect(locked.locks).toHaveLength(1);
  });

  test('a failed read is missing evidence, never a value: two "null"s do not make an identical rewrite', () => {
    const before = structure();
    // Both sides serialise as "null", but the new side could not be read.
    const unreadable = change(
      20,
      { old: 'null', new: 'null' },
      { old: [edge(10, 'Fields/[0]')], new: [edge(10, 'Fields/[0]')] },
      { read: { old: 'ok', new: 'failed' } },
    );
    const step = evaluateStep({ older: 1, newer: 2, changes: [unreadable], before, after: before });
    expect(step.verdict).toBe('indeterminate');
    expect(step.findings.map((f) => f.rule)).not.toContain('identical-rewrite');
    expect(step.findings.some((f) => f.verdict === 'incomplete')).toBe(true);
    // A real null object rewritten as null, both sides read: that is an identical rewrite.
    const realNull = change(
      20,
      { old: 'null', new: 'null' },
      { old: [edge(10, 'Fields/[0]')], new: [edge(10, 'Fields/[0]')] },
      { read: { old: 'ok', new: 'ok' } },
    );
    expect(
      evaluateStep({ older: 1, newer: 2, changes: [realNull], before, after: before }).findings.map(
        (f) => f.rule,
      ),
    ).toContain('identical-rewrite');
  });

  test('a proven violation decides even when other evidence is incomplete', () => {
    const before = structure();
    const pageContent = change(
      3,
      {
        old: '<</Type /Page/Parent 2 0 R/Contents 40 0 R>>',
        new: '<</Type /Page/Parent 2 0 R/Contents 41 0 R>>',
      },
      { old: [edge(2, 'Kids/[0]')], new: [edge(2, 'Kids/[0]')] },
    );
    const tooBig = change(
      50,
      { old: '<</X 1>>', new: '<</X 2>>' },
      { old: [edge(1, 'Big')], new: [edge(1, 'Big')] },
      { value: { old: null, new: null, truncated: true } },
    );
    const step = evaluateStep({
      older: 1,
      newer: 2,
      changes: [pageContent, tooBig],
      before,
      after: before,
    });
    expect(step.findings.some((f) => f.verdict === 'forbidden')).toBe(true);
    expect(step.findings.some((f) => f.verdict === 'incomplete')).toBe(true);
    expect(step.verdict).toBe('forbidden');
  });

  test('a sealed revision Acrobat cannot verify later changes to is judged indeterminate, not by the change', () => {
    const before = structure();
    // An ordinary permitted fill.
    const fill = change(
      20,
      { old: '<</FT /Tx/T (name)/V (a)>>', new: '<</FT /Tx/T (name)/V (b)>>' },
      { old: [edge(10, 'Fields/[0]')], new: [edge(10, 'Fields/[0]')] },
    );
    const healthy = { sparseXref: false, bareReferences: 0, referrersComplete: true };
    expect(
      evaluateStep({
        older: 1,
        newer: 2,
        changes: [fill],
        before,
        after: before,
        health: { old: healthy, new: healthy },
      }).verdict,
    ).toBe('permitted');
    for (const sick of [
      { ...healthy, sparseXref: true },
      { ...healthy, bareReferences: 1 },
    ]) {
      const step = evaluateStep({
        older: 1,
        newer: 2,
        changes: [fill],
        before,
        after: before,
        health: { old: sick, new: healthy },
      });
      expect(step.verdict).toBe('indeterminate');
      expect(step.findings.find((f) => f.rule === 'base-unverifiable')).toMatchObject({
        verdict: 'incomplete',
        objectNumber: 0,
      });
      expect(step.findings.find((f) => f.rule === 'base-unverifiable')!.detail).toMatch(/Acrobat/);
    }
    // The newer revision's health is not the sealed revision's problem...
    expect(
      evaluateStep({
        older: 1,
        newer: 2,
        changes: [fill],
        before,
        after: before,
        health: { old: healthy, new: { ...healthy, sparseXref: true } },
      }).verdict,
    ).toBe('permitted');
    // ...but an incomplete reachability walk on either side leaves every use unproven.
    const walked = evaluateStep({
      older: 1,
      newer: 2,
      changes: [fill],
      before,
      after: before,
      health: { old: healthy, new: { ...healthy, referrersComplete: false } },
    });
    expect(walked.verdict).toBe('indeterminate');
    expect(
      walked.findings.some((f) => f.rule === 'unexplained' && f.verdict === 'incomplete'),
    ).toBe(true);
  });

  test('no changes is unchanged; under P=1 an identical rewrite is still forbidden (not established)', () => {
    const before = structure({
      signatures: [signature(0, 30, { docMdp: 1, catalogCertification: true })],
    });
    expect(
      evaluateStep({ older: 1, newer: 2, changes: NO_CHANGES, before, after: before }).verdict,
    ).toBe('unchanged');
    const same = change(
      20,
      { old: '<</FT /Tx/T (name)/V (x)>>', new: '<</FT /Tx/T (name)/V (x)>>' },
      { old: [edge(10, 'Fields/[0]')], new: [edge(10, 'Fields/[0]')] },
    );
    const step = evaluateStep({ older: 1, newer: 2, changes: [same], before, after: before });
    expect(step.levelInForce).toBe('lta');
    expect(step.verdict).toBe('forbidden');
    expect(step.findings[0].rule).toBe('identical-rewrite');
    expect(step.findings[0].detail).toMatch(/sealed value under level 'lta'/);
  });

  test('a page rewritten identically after an approval signature is no change, as Acrobat says (corpus v1/04, v2/47)', () => {
    const before = structure(); // one approval signature: judged at the annotate baseline
    const samePage = change(
      3,
      {
        old: '<</Type /Page/Parent 2 0 R/Annots [30 0 R]>>',
        new: '<</Type /Page/Parent 2 0 R/Annots [30 0 R]>>',
      },
      { old: [edge(2, 'Kids/[0]')], new: [edge(2, 'Kids/[0]')] },
    );
    const step = evaluateStep({ older: 1, newer: 2, changes: [samePage], before, after: before });
    expect(step.levelInForce).toBe('annotate');
    expect(step.verdict).toBe('unchanged');
    expect(step.findings).toEqual([
      expect.objectContaining({ rule: 'identical-rewrite', verdict: 'permitted', objectNumber: 3 }),
    ]);
    // Under a P=2 or P=3 certification as well (v3/70, 71).
    for (const permission of [2, 3] as const) {
      const certified = structure({
        signatures: [signature(0, 30, { docMdp: permission, catalogCertification: true })],
      });
      expect(
        evaluateStep({
          older: 1,
          newer: 2,
          changes: [samePage],
          before: certified,
          after: certified,
        }).verdict,
      ).toBe('unchanged');
    }
  });

  test('an identical rewrite before the first signature is no change either', () => {
    const unsigned = structure({ signatures: [signature(0, 30, { signed: false })] });
    const samePage = change(
      3,
      {
        old: '<</Type /Page/Parent 2 0 R/Annots [30 0 R]>>',
        new: '<</Type /Page/Parent 2 0 R/Annots [30 0 R]>>',
      },
      { old: [edge(2, 'Kids/[0]')], new: [edge(2, 'Kids/[0]')] },
    );
    const step = evaluateStep({
      older: 0,
      newer: 1,
      changes: [samePage],
      before: unsigned,
      after: unsigned,
    });
    expect(step.verdict).toBe('unchanged');
    expect(step.findings).toEqual([
      expect.objectContaining({ rule: 'identical-rewrite', verdict: 'permitted', objectNumber: 3 }),
    ]);
  });

  test('a form fill is permitted under fill and annotate, forbidden under lta', () => {
    const fill = [
      change(
        20,
        { old: '<</FT /Tx/T (name)/V (a)>>', new: '<</FT /Tx/T (name)/V (b)>>' },
        { old: [edge(10, 'Fields/[0]')], new: [edge(10, 'Fields/[0]')] },
      ),
      change(
        21,
        {
          old: '<</AP <</N 22 0 R>>/Subtype /Widget>>',
          new: '<</AP <</N 40 0 R>>/Subtype /Widget>>',
        },
        {
          old: [edge(3, 'Annots/[0]'), edge(20, 'Kids/[0]')],
          new: [edge(3, 'Annots/[0]'), edge(20, 'Kids/[0]')],
        },
      ),
      change(
        40,
        { old: null, new: 'stream(20,ff)<</Resources <</Font <</Helv 41 0 R>>>>/Subtype /Form>>' },
        { new: [edge(21, 'AP/N')] },
      ),
      change(
        41,
        { old: null, new: '<</BaseFont /Helvetica/Type /Font>>' },
        { new: [edge(40, 'Resources/Font/Helv')] },
      ),
      change(
        22,
        { old: 'stream(10,aa)<</Subtype /Form>>', new: null },
        { old: [edge(21, 'AP/N')] },
      ),
      change(0, { old: '<</Root 1 0 R/Size 42>>', new: '<</Prev 1234/Root 1 0 R/Size 43>>' }, {}),
    ];
    const approval = structure();
    const permitted = evaluateStep({
      older: 1,
      newer: 2,
      changes: fill,
      before: approval,
      after: approval,
    });
    expect(permitted.verdict).toBe('permitted');
    expect(permitted.findings.filter((f) => f.verdict === 'forbidden')).toEqual([]);
    const certifiedFill = structure({
      signatures: [signature(0, 30, { docMdp: 2, catalogCertification: true })],
    });
    expect(
      evaluateStep({
        older: 1,
        newer: 2,
        changes: fill,
        before: certifiedFill,
        after: certifiedFill,
      }).verdict,
    ).toBe('permitted');
    const lta = structure({
      signatures: [signature(0, 30, { docMdp: 1, catalogCertification: true })],
    });
    const forbidden = evaluateStep({ older: 1, newer: 2, changes: fill, before: lta, after: lta });
    expect(forbidden.verdict).toBe('forbidden');
    // One cause, named once per object: nothing may follow such a certification.
    const refused = forbidden.findings.filter((f) => f.verdict === 'forbidden');
    expect(refused.map((f) => f.objectNumber).sort((a, b) => a - b)).toEqual([20, 21, 22, 40, 41]);
    expect(new Set(refused.map((f) => f.rule))).toEqual(new Set(['no-changes-certification']));
  });

  test('a shared resource keeps its other reference unexplained', () => {
    const fill = [
      change(
        21,
        {
          old: '<</AP <</N 22 0 R>>/Subtype /Widget>>',
          new: '<</AP <</N 40 0 R>>/Subtype /Widget>>',
        },
        { old: [edge(3, 'Annots/[0]')], new: [edge(3, 'Annots/[0]')] },
      ),
      change(
        40,
        { old: null, new: 'stream(20,ff)<</Resources <</Font <</Helv 41 0 R>>>>>>' },
        { new: [edge(21, 'AP/N')] },
      ),
      // The font is also referenced by the page content resources: not a fill.
      change(
        41,
        { old: null, new: '<</Type /Font>>' },
        { new: [edge(40, 'Resources/Font/Helv'), edge(3, 'Resources/Font/Helv')] },
      ),
    ];
    const s = structure();
    const step = evaluateStep({ older: 1, newer: 2, changes: fill, before: s, after: s });
    expect(step.verdict).toBe('forbidden');
    const unexplained = step.findings.find(
      (f) => f.rule === 'unexplained' && f.objectNumber === 41,
    );
    expect(unexplained?.edge).toBe('3:Resources/Font/Helv');
  });

  test('a page content change, a catalog change and a deleted page are forbidden', () => {
    const s = structure();
    const content = [
      change(
        4,
        { old: 'stream(10,aa)<</Length 10>>', new: 'stream(12,bb)<</Length 12>>' },
        { old: [edge(3, 'Contents')], new: [edge(3, 'Contents')] },
        { streamDataChanged: true },
      ),
    ];
    expect(
      evaluateStep({ older: 1, newer: 2, changes: content, before: s, after: s }).verdict,
    ).toBe('forbidden');
    const catalog = [
      change(
        1,
        {
          old: '<</Pages 2 0 R/Type /Catalog>>',
          new: '<</Pages 2 0 R/Type /Catalog/OpenAction 9 0 R>>',
        },
        { old: [edge(0, 'Root')], new: [edge(0, 'Root')] },
      ),
    ];
    const cat = evaluateStep({ older: 1, newer: 2, changes: catalog, before: s, after: s });
    expect(cat.verdict).toBe('forbidden');
    expect(cat.findings[0].rule).toBe('catalog-housekeeping');
    const deleted = [
      change(
        2,
        {
          old: '<</Count 2/Kids [3 0 R 5 0 R]/Type /Pages>>',
          new: '<</Count 1/Kids [3 0 R]/Type /Pages>>',
        },
        { old: [edge(1, 'Pages')], new: [edge(1, 'Pages')] },
      ),
      change(5, { old: '<</Parent 2 0 R/Type /Page>>', new: null }, { old: [edge(2, 'Kids/[1]')] }),
    ];
    const del = evaluateStep({
      older: 1,
      newer: 2,
      changes: deleted,
      before: structure({ pages: [3, 5] }),
      after: s,
    });
    expect(del.verdict).toBe('forbidden');
  });

  test('metadata, info, trailer housekeeping and DSS: permitted after a P=2 certification, forbidden after P=1', () => {
    const fill = structure({
      signatures: [signature(0, 30, { docMdp: 2, catalogCertification: true })],
    });
    const lta = structure({
      signatures: [signature(0, 30, { docMdp: 1, catalogCertification: true })],
    });
    const changes = [
      change(
        1,
        {
          old: '<</Metadata 7 0 R/Pages 2 0 R/Type /Catalog>>',
          new: '<</DSS 50 0 R/Metadata 8 0 R/Pages 2 0 R/Type /Catalog>>',
        },
        { old: [edge(0, 'Root')], new: [edge(0, 'Root')] },
      ),
      change(
        8,
        { old: null, new: 'stream(100,cc)<</Type /Metadata>>' },
        { new: [edge(1, 'Metadata')] },
      ),
      change(
        7,
        { old: 'stream(90,dd)<</Type /Metadata>>', new: null },
        { old: [edge(1, 'Metadata')] },
      ),
      change(
        6,
        { old: '<</Producer (a)>>', new: '<</ModDate (D:2026)/Producer (a)>>' },
        { old: [edge(0, 'Info')], new: [edge(0, 'Info')] },
      ),
      change(50, { old: null, new: '<</Certs [51 0 R]>>' }, { new: [edge(1, 'DSS')] }),
      change(
        51,
        { old: null, new: 'stream(400,ee)<</Length 400>>' },
        { new: [edge(50, 'Certs/[0]')] },
      ),
      change(
        0,
        {
          old: '<</Info 6 0 R/Root 1 0 R/Size 60>>',
          new: '<</Info 6 0 R/Prev 999/Root 1 0 R/Size 61>>',
        },
        {},
      ),
    ];
    const step = evaluateStep({ older: 1, newer: 2, changes, before: fill, after: fill });
    expect(step.findings.filter((f) => f.verdict === 'forbidden')).toEqual([]);
    expect(step.verdict).toBe('permitted');

    // Acrobat reports a no-changes certification as altered for each of these alone
    // (fixtures signature-long-term), so none is housekeeping there. The trailer is the
    // revision's own bookkeeping and stays so.
    const strict = evaluateStep({ older: 1, newer: 2, changes, before: lta, after: lta });
    expect(strict.verdict).toBe('forbidden');
    const refused = strict.findings.filter((f) => f.verdict === 'forbidden');
    expect(refused.map((f) => f.objectNumber).sort((a, b) => a - b)).toEqual([1, 6, 7, 8, 50, 51]);
    expect(new Set(refused.map((f) => f.rule))).toEqual(new Set(['no-changes-certification']));
    expect(strict.findings.find((f) => f.objectNumber === 0)).toMatchObject({
      rule: 'trailer',
      verdict: 'permitted',
    });
  });

  test('a second signature with a FieldMDP lock is permitted; touching the locked field afterwards is not', () => {
    const before = structure({
      fields: [
        { objectNumber: 20, name: 'name', kind: 'text', widgets: [21] },
        { objectNumber: 30, name: 'sig0', kind: 'signature', widgets: [30] },
        { objectNumber: 60, name: 'sig1', kind: 'signature', widgets: [60] },
      ],
      signatures: [
        signature(0, 30),
        signature(1, 60, {
          signed: false,
          fieldName: 'sig1',
          revisionIndex: null,
          coverage: null,
          byteRange: null,
        }),
      ],
    });
    const after = structure({
      fields: before.fields,
      signatures: [
        signature(0, 30),
        signature(1, 60, {
          fieldName: 'sig1',
          revisionIndex: 2,
          fieldMdp: { action: 'include', fields: ['name'] },
        }),
      ],
    });
    const signing = [
      change(
        60,
        {
          old: '<</FT /Sig/Subtype /Widget/T (sig1)>>',
          new: '<</AP <</N 62 0 R>>/FT /Sig/Subtype /Widget/T (sig1)/V 61 0 R>>',
        },
        {
          old: [edge(10, 'Fields/[2]'), edge(3, 'Annots/[2]')],
          new: [edge(10, 'Fields/[2]'), edge(3, 'Annots/[2]')],
        },
      ),
      change(
        61,
        { old: null, new: '<</ByteRange [0 1 2 3]/Contents (x)/Filter /Adobe.PPKLite/Type /Sig>>' },
        { new: [edge(60, 'V')] },
      ),
      change(62, { old: null, new: 'stream(5,ab)<</Subtype /Form>>' }, { new: [edge(60, 'AP/N')] }),
      // The lock sets ReadOnly on the covered field.
      change(
        20,
        { old: '<</FT /Tx/T (name)/V (a)>>', new: '<</FT /Tx/Ff 1/T (name)/V (a)>>' },
        { old: [edge(10, 'Fields/[0]')], new: [edge(10, 'Fields/[0]')] },
      ),
      change(
        10,
        {
          old: '<</Fields [20 0 R 30 0 R 60 0 R]>>',
          new: '<</Fields [20 0 R 30 0 R 60 0 R]/SigFlags 3>>',
        },
        { old: [edge(1, 'AcroForm')], new: [edge(1, 'AcroForm')] },
      ),
    ];
    const step = evaluateStep({ older: 1, newer: 2, changes: signing, before, after });
    expect(step.findings.filter((f) => f.verdict === 'forbidden')).toEqual([]);
    expect(step.verdict).toBe('permitted');
    // Next step: the locked field changes → forbidden by the lock, whatever the level.
    const later = [
      change(
        20,
        { old: '<</FT /Tx/Ff 1/T (name)/V (a)>>', new: '<</FT /Tx/Ff 1/T (name)/V (b)>>' },
        { old: [edge(10, 'Fields/[0]')], new: [edge(10, 'Fields/[0]')] },
      ),
    ];
    const locked = evaluateStep({ older: 2, newer: 3, changes: later, before: after, after });
    expect(locked.verdict).toBe('forbidden');
    expect(locked.findings.find((f) => f.objectNumber === 20)?.rule).toBe('field-lock');
    expect(locked.locks).toHaveLength(1);
  });

  test('a /Lock added to an EXISTING signature field while signing it: permitted after an approval signature (corpus v1/19), forbidden under P=2 (v3/69)', () => {
    const before = structure({
      fields: [
        ...structure().fields,
        { objectNumber: 60, name: 'sig1', kind: 'signature', widgets: [60] },
      ],
      signatures: [
        signature(0, 30),
        signature(1, 60, {
          signed: false,
          fieldName: 'sig1',
          revisionIndex: null,
          coverage: null,
          byteRange: null,
        }),
      ],
    });
    const after = structure({
      fields: before.fields,
      signatures: [
        signature(0, 30),
        signature(1, 60, {
          fieldName: 'sig1',
          revisionIndex: 2,
          fieldMdp: { action: 'include', fields: ['name'] },
          lock: { action: 'include', fields: ['name'] },
        }),
      ],
    });
    const signing = [
      change(
        60,
        {
          old: '<</FT /Sig/Subtype /Widget/T (sig1)>>',
          new: '<</FT /Sig/Lock 63 0 R/Subtype /Widget/T (sig1)/V 61 0 R>>',
        },
        {
          old: [edge(10, 'Fields/[2]'), edge(3, 'Annots/[2]')],
          new: [edge(10, 'Fields/[2]'), edge(3, 'Annots/[2]')],
        },
      ),
      change(
        61,
        { old: null, new: '<</ByteRange [0 1 2 3]/Contents (x)/Filter /Adobe.PPKLite/Type /Sig>>' },
        { new: [edge(60, 'V')] },
      ),
      change(
        63,
        { old: null, new: '<</Action /Include/Fields [(name)]/Type /SigFieldLock>>' },
        { new: [edge(60, 'Lock')] },
      ),
    ];
    const step = evaluateStep({ older: 1, newer: 2, changes: signing, before, after });
    expect(step.verdict).toBe('permitted');
    expect(step.findings.some((f) => f.objectNumber === 63 && f.verdict === 'permitted')).toBe(
      true,
    );

    // The same signing under a P=2 certification: the lock is not form fill-in.
    const certifiedBefore = structure({
      fields: before.fields,
      signatures: [
        signature(0, 30, { docMdp: 2, catalogCertification: true }),
        before.signatures[1],
      ],
    });
    const certifiedAfter = structure({
      fields: before.fields,
      signatures: [
        signature(0, 30, { docMdp: 2, catalogCertification: true }),
        after.signatures[1],
      ],
    });
    const certified = evaluateStep({
      older: 1,
      newer: 2,
      changes: signing,
      before: certifiedBefore,
      after: certifiedAfter,
    });
    expect(certified.verdict).toBe('forbidden');
    expect(
      certified.findings.find((f) => f.objectNumber === 60 && f.verdict === 'forbidden')?.detail,
    ).toContain('Lock');
    // One cause, not a cascade: the /V and /Lock edges are still claimed.
    expect(certified.findings.filter((f) => f.verdict === 'forbidden')).toHaveLength(1);
  });

  test('a certification after an existing signature, or /Perms out of place, is forbidden', () => {
    const before = structure({
      fields: [
        ...structure().fields,
        { objectNumber: 60, name: 'sig1', kind: 'signature', widgets: [60] },
      ],
      signatures: [
        signature(0, 30),
        signature(1, 60, { signed: false, revisionIndex: null, coverage: null, byteRange: null }),
      ],
    });
    const after = structure({
      fields: before.fields,
      signatures: [
        signature(0, 30),
        signature(1, 60, { docMdp: 2, catalogCertification: true, revisionIndex: 2 }),
      ],
    });
    const changes = [
      change(
        60,
        { old: '<</FT /Sig/T (sig1)>>', new: '<</FT /Sig/T (sig1)/V 61 0 R>>' },
        { old: [edge(10, 'Fields/[2]')], new: [edge(10, 'Fields/[2]')] },
      ),
      change(
        61,
        { old: null, new: '<</Type /Sig>>' },
        { new: [edge(60, 'V'), edge(70, 'DocMDP')] },
      ),
      change(70, { old: null, new: '<</DocMDP 61 0 R>>' }, { new: [edge(1, 'Perms')] }),
      change(
        1,
        {
          old: '<</Pages 2 0 R/Type /Catalog>>',
          new: '<</Pages 2 0 R/Perms 70 0 R/Type /Catalog>>',
        },
        { old: [edge(0, 'Root')], new: [edge(0, 'Root')] },
      ),
    ];
    const step = evaluateStep({ older: 1, newer: 2, changes, before, after });
    expect(step.verdict).toBe('forbidden');
    expect(
      step.findings.some(
        (f) => f.rule === 'signature-added' && /certification/.test(f.detail ?? ''),
      ),
    ).toBe(true);
  });

  test('a truncated value makes the step indeterminate, never permitted', () => {
    const s = structure();
    const c = change(
      20,
      { old: '<</V (a)>>', new: '<</V (b)>>' },
      { old: [edge(10, 'Fields/[0]')], new: [edge(10, 'Fields/[0]')] },
    );
    c.value.truncated = true;
    expect(evaluateStep({ older: 1, newer: 2, changes: [c], before: s, after: s }).verdict).toBe(
      'indeterminate',
    );
  });

  test('annotations are permitted at annotate (the approval baseline) and forbidden at fill; widgets are never annotations', () => {
    const changes = [
      change(
        3,
        { old: '<</Annots [21 0 R]/Type /Page>>', new: '<</Annots [21 0 R 80 0 R]/Type /Page>>' },
        { old: [edge(2, 'Kids/[0]')], new: [edge(2, 'Kids/[0]')] },
      ),
      change(
        80,
        { old: null, new: '<</AP <</N 81 0 R>>/Rect [0 0 1 1]/Subtype /Square/Type /Annot>>' },
        { new: [edge(3, 'Annots/[1]')] },
      ),
      change(81, { old: null, new: 'stream(3,cd)<</Subtype /Form>>' }, { new: [edge(80, 'AP/N')] }),
    ];
    // A P=3 certification declared annotations allowed.
    const certifiedAnnotate = structure({
      signatures: [signature(0, 30, { docMdp: 3, catalogCertification: true })],
    });
    expect(
      evaluateStep({
        older: 1,
        newer: 2,
        changes,
        before: certifiedAnnotate,
        after: certifiedAnnotate,
      }).verdict,
    ).toBe('permitted');
    // An approval signature is judged at the baseline (annotate): Acrobat keeps
    // it valid with "Annotations Created" (corpus v3/88), and so do we.
    const approval = structure();
    expect(
      evaluateStep({ older: 1, newer: 2, changes, before: approval, after: approval }).verdict,
    ).toBe('permitted');
    // A P=2 certification declared only form fill-in: the annotation is forbidden.
    const certified = structure({
      signatures: [signature(0, 30, { docMdp: 2, catalogCertification: true })],
    });
    expect(
      evaluateStep({ older: 1, newer: 2, changes, before: certified, after: certified }).verdict,
    ).toBe('forbidden');
    // Removing a widget through /Annots is a form structure change, not an annotation edit.
    const removeWidget = [
      change(
        3,
        { old: '<</Annots [21 0 R]/Type /Page>>', new: '<</Annots []/Type /Page>>' },
        { old: [edge(2, 'Kids/[0]')], new: [edge(2, 'Kids/[0]')] },
      ),
    ];
    expect(
      evaluateStep({ older: 1, newer: 2, changes: removeWidget, before: approval, after: approval })
        .verdict,
    ).toBe('forbidden');
  });
});

// ---------------------------------------------------------------------------
// Hardening after the 2026-09-11 review: evidence must never fail open.
// ---------------------------------------------------------------------------

describe('evaluateStep: hardening', () => {
  const certifiedLta = structure({
    signatures: [signature(0, 30, { docMdp: 1, catalogCertification: true })],
  });
  const certifiedFill = structure({
    signatures: [signature(0, 30, { docMdp: 2, catalogCertification: true })],
  });

  test('a present side whose value is missing is incomplete, whatever the transport flag says', () => {
    const c = change(
      1,
      { old: '<</Pages 2 0 R/Type /Catalog>>', new: '<</Pages 2 0 R/Type /Catalog>>' },
      { old: [edge(0, 'Root')], new: [edge(0, 'Root')] },
    );
    c.value = { old: null, new: null, truncated: false };
    const step = evaluateStep({
      older: 1,
      newer: 2,
      changes: [c],
      before: certifiedLta,
      after: certifiedLta,
    });
    expect(step.verdict).toBe('indeterminate');
    expect(step.findings.some((f) => f.objectNumber === 1 && f.verdict === 'incomplete')).toBe(
      true,
    );
  });

  test('the trailer, which carries no generation numbers, is covered by the evidence check', () => {
    const c = change(0, { old: '<</Root 1 0 R/Size 5>>', new: '<</Root 1 0 R/Size 5>>' }, {});
    c.value = { old: parsePdfValue('<</Root 1 0 R/Size 5>>'), new: null, truncated: false };
    const step = evaluateStep({
      older: 1,
      newer: 2,
      changes: [c],
      before: certifiedFill,
      after: certifiedFill,
    });
    expect(step.verdict).toBe('indeterminate');
  });

  test('unresolvable references (resolver budget) are incomplete, never permitted', () => {
    const c = change(
      9,
      { old: '<</JS (a)/S /JavaScript>>', new: '<</JS (b)/S /JavaScript>>' },
      {},
      { usageIncomplete: true },
    );
    const step = evaluateStep({
      older: 1,
      newer: 2,
      changes: [c],
      before: certifiedFill,
      after: certifiedFill,
    });
    expect(step.verdict).toBe('indeterminate');
  });

  test('a DSS update cannot vouch for an unrelated catalog edge', () => {
    const changes = [
      change(
        9,
        { old: '<</JS (a)/S /JavaScript>>', new: '<</JS (b)/S /JavaScript>>' },
        { old: [edge(1, 'OpenAction')], new: [edge(1, 'OpenAction')] },
      ),
      change(
        50,
        { old: '<</Certs []>>', new: '<</Certs []/VRI <<>>>>' },
        { old: [edge(1, 'DSS')], new: [edge(1, 'DSS')] },
      ),
    ];
    // After a certification that allows form filling: the level at which a DSS update is allowed.
    const certifiedFill = structure({
      signatures: [signature(0, 30, { docMdp: 2, catalogCertification: true })],
    });
    const step = evaluateStep({
      older: 1,
      newer: 2,
      changes,
      before: certifiedFill,
      after: certifiedFill,
    });
    expect(step.verdict).toBe('forbidden');
    expect(step.findings.some((f) => f.objectNumber === 9 && f.verdict === 'forbidden')).toBe(true);
    expect(step.findings.some((f) => f.objectNumber === 50 && f.verdict === 'permitted')).toBe(
      true,
    );
  });

  test('an appearance stream joined through a fill cannot vouch for a widget action', () => {
    const changes = [
      change(
        20,
        { old: '<</FT /Tx/T (name)/V (a)>>', new: '<</FT /Tx/T (name)/V (b)>>' },
        { old: [edge(10, 'Fields/[0]')], new: [edge(10, 'Fields/[0]')] },
      ),
      change(
        23,
        { old: 'stream(3,aa)<</Length 3>>', new: 'stream(9,bb)<</Length 9>>' },
        { old: [edge(20, 'AP/N')], new: [edge(20, 'AP/N')] },
      ),
      change(
        24,
        { old: '<</JS (a)/S /JavaScript>>', new: '<</JS (b)/S /JavaScript>>' },
        { old: [edge(20, 'A')], new: [edge(20, 'A')] },
      ),
    ];
    const step = evaluateStep({
      older: 1,
      newer: 2,
      changes,
      before: certifiedFill,
      after: certifiedFill,
    });
    expect(step.verdict).toBe('forbidden');
    expect(step.findings.some((f) => f.objectNumber === 24 && f.verdict === 'forbidden')).toBe(
      true,
    );
    expect(step.findings.some((f) => f.objectNumber === 20 && f.verdict === 'permitted')).toBe(
      true,
    );
  });

  test('a field added and signed in one step is permitted; its /V and indirect /Lock are claimed', () => {
    const after = structure({
      fields: [
        { objectNumber: 20, name: 'name', kind: 'text', widgets: [21] },
        { objectNumber: 30, name: 'sig0', kind: 'signature', widgets: [30] },
        { objectNumber: 60, name: 'sig1', kind: 'signature', widgets: [60] },
      ],
      signatures: [
        signature(0, 30, { docMdp: 2, catalogCertification: true }),
        signature(1, 60, {
          fieldName: 'sig1',
          revisionIndex: 2,
          fieldMdp: { action: 'include', fields: ['name'] },
          lock: { action: 'include', fields: ['name'] },
        }),
      ],
    });
    const changes = [
      change(
        3,
        {
          old: '<</Annots [21 0 R 30 0 R]/Type /Page>>',
          new: '<</Annots [21 0 R 30 0 R 60 0 R]/Type /Page>>',
        },
        { old: [edge(2, 'Kids/[0]')], new: [edge(2, 'Kids/[0]')] },
      ),
      change(
        10,
        {
          old: '<</Fields [20 0 R 30 0 R]>>',
          new: '<</Fields [20 0 R 30 0 R 60 0 R]/SigFlags 3>>',
        },
        { old: [edge(1, 'AcroForm')], new: [edge(1, 'AcroForm')] },
      ),
      change(
        60,
        {
          old: null,
          new: '<</FT /Sig/Lock 63 0 R/P 3 0 R/Rect [0 0 1 1]/Subtype /Widget/T (sig1)/Type /Annot/V 61 0 R>>',
        },
        { new: [edge(3, 'Annots/[2]'), edge(10, 'Fields/[2]')] },
      ),
      change(
        61,
        { old: null, new: '<</ByteRange [0 1 2 3]/Contents (x)/Type /Sig>>' },
        { new: [edge(60, 'V')] },
      ),
      change(
        63,
        { old: null, new: '<</Action /Include/Fields [(name)]/Type /SigFieldLock>>' },
        { new: [edge(60, 'Lock')] },
      ),
    ];
    const step = evaluateStep({ older: 1, newer: 2, changes, before: certifiedFill, after });
    expect(step.findings.filter((f) => f.verdict !== 'permitted')).toEqual([]);
    expect(step.verdict).toBe('permitted');
  });

  test('a lock landing on a terminal without its own /Ff is judged against the effective flags', () => {
    const before = structure({
      fields: [
        { objectNumber: 20, name: 'name', kind: 'text', widgets: [21], flags: 4096 },
        { objectNumber: 30, name: 'sig0', kind: 'signature', widgets: [30] },
      ],
      signatures: [],
    });
    const after = structure({
      fields: before.fields,
      signatures: [
        signature(0, 30, {
          fieldMdp: { action: 'include', fields: ['name'] },
          lock: { action: 'include', fields: ['name'] },
        }),
      ],
    });
    const changes = [
      change(
        20,
        { old: '<</FT /Tx/T (name)/V (x)>>', new: '<</FT /Tx/Ff 4097/T (name)/V (x)>>' },
        { old: [edge(10, 'Fields/[0]')], new: [edge(10, 'Fields/[0]')] },
      ),
      change(
        30,
        {
          old: '<</FT /Sig/Subtype /Widget/T (sig0)>>',
          new: '<</FT /Sig/Lock 32 0 R/Subtype /Widget/T (sig0)/V 31 0 R>>',
        },
        {
          old: [edge(10, 'Fields/[1]'), edge(3, 'Annots/[1]')],
          new: [edge(10, 'Fields/[1]'), edge(3, 'Annots/[1]')],
        },
      ),
      change(
        31,
        { old: null, new: '<</ByteRange [0 1 2 3]/Contents (x)/Type /Sig>>' },
        { new: [edge(30, 'V')] },
      ),
      change(
        32,
        { old: null, new: '<</Action /Include/Fields [(name)]/Type /SigFieldLock>>' },
        { new: [edge(30, 'Lock')] },
      ),
    ];
    const step = evaluateStep({ older: 0, newer: 1, changes, before, after });
    expect(step.findings.filter((f) => f.verdict !== 'permitted')).toEqual([]);
    expect(step.verdict).toBe('permitted');
  });
});

describe('evaluateStep: appearance regeneration', () => {
  const certifiedFill = structure({
    signatures: [signature(0, 30, { docMdp: 2, catalogCertification: true })],
  });
  const certifiedLta = structure({
    signatures: [signature(0, 30, { docMdp: 1, catalogCertification: true })],
  });

  test('an appearance stream regenerated under an untouched field is form filling at P=2, forbidden at P=1', () => {
    const changes = [
      change(
        23,
        { old: 'stream(3,aa)<</Length 3>>', new: 'stream(9,bb)<</Length 9>>' },
        { old: [edge(21, 'AP/N', [22])], new: [edge(21, 'AP/N', [22])] },
      ),
    ];
    const fill = evaluateStep({
      older: 1,
      newer: 2,
      changes,
      before: certifiedFill,
      after: certifiedFill,
    });
    expect(fill.verdict).toBe('permitted');
    expect(fill.findings.find((f) => f.objectNumber === 23)?.rule).toBe('form-fill');
    expect(
      evaluateStep({ older: 1, newer: 2, changes, before: certifiedLta, after: certifiedLta })
        .verdict,
    ).toBe('forbidden');
  });

  test("an appearance stream shared between two fields is nobody's regeneration", () => {
    const two = structure({
      fields: [
        ...structure().fields,
        { objectNumber: 40, name: 'other', kind: 'text', widgets: [40] },
      ],
      signatures: certifiedFill.signatures,
    });
    const changes = [
      change(
        20,
        { old: '<</FT /Tx/T (name)/V (a)>>', new: '<</FT /Tx/T (name)/V (b)>>' },
        { old: [edge(10, 'Fields/[0]')], new: [edge(10, 'Fields/[0]')] },
      ),
      change(
        23,
        { old: 'stream(3,aa)<</Length 3>>', new: 'stream(9,bb)<</Length 9>>' },
        {
          old: [edge(21, 'AP/N', [22]), edge(40, 'AP/N', [22])],
          new: [edge(21, 'AP/N', [22]), edge(40, 'AP/N', [22])],
        },
      ),
    ];
    const step = evaluateStep({ older: 1, newer: 2, changes, before: two, after: two });
    expect(step.verdict).toBe('forbidden');
    expect(
      step.findings.some(
        (f) => f.objectNumber === 23 && f.verdict === 'forbidden' && f.edge === '40:AP/N',
      ),
    ).toBe(true);
  });
});

describe('evaluateStep: a new appearance on a signature field that is not signed', () => {
  /** {@link structure} with a second signature field, `open` (31), that nobody signed. */
  const withOpenField = (first: Partial<Signature> = {}, widgets: number[] = [31]) =>
    structure({
      fields: [
        ...structure().fields,
        { objectNumber: 31, name: 'open', kind: 'signature', widgets },
      ],
      signatures: [
        signature(0, 30, first),
        signature(1, 31, {
          signed: false,
          fieldName: 'open',
          revisionIndex: null,
          coverage: null,
          byteRange: null,
        }),
      ],
    });
  const approval = withOpenField();
  const listed = [edge(10, 'Fields/[2]'), edge(3, 'Annots/[2]')];
  /** Object `n` written with `/AP` pointing at `ap` instead of `32`, and `extra` keys. */
  const redrawn = (n: number, name: string, uses: ObjectReferrer[], extra = '') =>
    change(
      n,
      {
        old: `<</AP <</N 32 0 R>>/FT /Sig/T (${name})>>`,
        new: `<</AP <</N 40 0 R>>${extra}/FT /Sig/T (${name})>>`,
      },
      { old: uses, new: uses },
    );
  /** The wrapper EmbedPDF draws a picture with: a form, the form it places, and the image. */
  const wrapper = (owner: number) => [
    change(
      40,
      { old: null, new: 'stream(41,aa)<</Resources <</XObject <</EPDFWRAP 41 0 R>>>>>>' },
      { new: [edge(owner, 'AP/N')] },
    ),
    change(
      41,
      { old: null, new: 'stream(58,bb)<</Resources <</XObject <</FXX1 42 0 R>>>>>>' },
      { new: [edge(40, 'Resources/XObject/EPDFWRAP')] },
    ),
    change(
      42,
      { old: null, new: 'stream(26,cc)<</Subtype /Image/Width 30/Height 10>>' },
      { new: [edge(41, 'Resources/XObject/FXX1')] },
    ),
  ];
  const judge = (changes: ObjectChange[], at: RevisionStructure = approval) =>
    evaluateStep({ older: 1, newer: 2, changes, before: at, after: at });
  const refused = (step: ReturnType<typeof evaluateStep>) =>
    step.findings.filter((f) => f.verdict === 'forbidden');

  test('after an approval signature it is permitted: the field changes /AP alone, and all under it is new (corpus v4/93, 94, 97)', () => {
    const step = judge([redrawn(31, 'open', listed), ...wrapper(31)]);
    expect(step.verdict).toBe('permitted');
    expect(refused(step)).toEqual([]);
    expect(step.findings.find((f) => f.objectNumber === 31)?.rule).toBe('signature-appearance');
  });

  test('a widget of its own changes /AP, and the field nothing (corpus v4/99)', () => {
    const separate = withOpenField({}, [33]);
    const widget = redrawn(33, 'open', [edge(31, 'Kids/[0]'), edge(3, 'Annots/[2]')]);
    const step = judge([widget, ...wrapper(33)], separate);
    expect(step.verdict).toBe('permitted');
    expect(step.findings.find((f) => f.objectNumber === 33)?.rule).toBe('signature-appearance');
  });

  test('the old appearance may go with it; an object that was there before may not join', () => {
    const freed = change(
      32,
      { old: 'stream(9,dd)<</Subtype /Form>>', new: null },
      { old: [edge(31, 'AP/N')] },
    );
    expect(judge([redrawn(31, 'open', listed), ...wrapper(31), freed]).verdict).toBe('permitted');
    // A font that was in the file, changed and drawn by the new appearance: not part of it.
    const font = change(
      50,
      { old: '<</BaseFont /Helvetica/Type /Font>>', new: '<</BaseFont /Courier/Type /Font>>' },
      { old: [edge(10, 'DR/Font/Helv')], new: [edge(40, 'Resources/Font/F1')] },
    );
    const step = judge([redrawn(31, 'open', listed), ...wrapper(31), font]);
    expect(step.verdict).toBe('forbidden');
    expect(refused(step).map((f) => [f.objectNumber, f.rule])).toContainEqual([50, 'unexplained']);
  });

  test('under a certification that allows form filling it is permitted too (corpus v4/101, 102)', () => {
    const certified = withOpenField({ docMdp: 2, catalogCertification: true });
    const step = judge([redrawn(31, 'open', listed), ...wrapper(31)], certified);
    expect(step.levelInForce).toBe('fill');
    expect(step.verdict).toBe('permitted');
    // After one that allows no changes, nothing is permitted.
    const none = withOpenField({ docMdp: 1, catalogCertification: true });
    expect(judge([redrawn(31, 'open', listed), ...wrapper(31)], none).verdict).toBe('forbidden');
  });

  test("the signed field's own appearance stays forbidden, though Acrobat accepts it (corpus v4/95)", () => {
    const step = judge([redrawn(30, 'sig0', [edge(10, 'Fields/[1]')]), ...wrapper(30)]);
    expect(step.verdict).toBe('forbidden');
    expect(step.findings.some((f) => f.rule === 'signature-appearance')).toBe(false);
  });

  test('a key beyond /AP is named as the cause (Acrobat: "Form Fields with Property Changes")', () => {
    const step = judge([
      redrawn(31, 'open', listed, '/EMBD_Metadata <</AppearanceFit (contain)>>'),
      ...wrapper(31),
    ]);
    expect(step.verdict).toBe('forbidden');
    const [cause] = refused(step).filter((f) => f.objectNumber === 31);
    expect(cause.rule).toBe('signature-appearance');
    expect(cause.detail).toMatch(/keys changed: EMBD_Metadata/);
    // One cause for the field: its references are explained by it.
    expect(refused(step).filter((f) => f.objectNumber === 31)).toHaveLength(1);
  });

  test("a field signed in the same step is the signing rule's, and a lock condemns before it", () => {
    const signedNow = structure({
      fields: approval.fields,
      signatures: [signature(0, 30), signature(1, 31, { fieldName: 'open', revisionIndex: 2 })],
    });
    const step = evaluateStep({
      older: 1,
      newer: 2,
      changes: [redrawn(31, 'open', listed), ...wrapper(31)],
      before: approval,
      after: signedNow,
    });
    expect(step.findings.some((f) => f.rule === 'signature-appearance')).toBe(false);
    const locked = withOpenField({
      fieldMdp: { action: 'include', fields: ['open'] },
    } as Partial<Signature>);
    const lockedStep = judge([redrawn(31, 'open', listed), ...wrapper(31)], locked);
    expect(lockedStep.verdict).toBe('forbidden');
    expect(refused(lockedStep).find((f) => f.objectNumber === 31)?.rule).toBe('field-lock');
  });
});

describe('evaluateStep: a signature field added by Acrobat', () => {
  /**
   * What Acrobat writes when it adds a document timestamp to a page whose /Annots was an array
   * inside the page: a new field that is its own widget, the AcroForm's list grown, and the
   * page's /Annots moved into a new object that holds the old entry and the new widget.
   */
  const moved = (
    holder: string,
    holderUsage: ObjectReferrer[] = [edge(3, 'Annots')],
  ): ObjectChange[] => [
    change(
      3,
      {
        old: '<</Annots [30 0 R]/Parent 2 0 R/Type /Page>>',
        new: '<</Annots 60 0 R/Parent 2 0 R/Type /Page>>',
      },
      {
        old: [edge(2, 'Kids/[0]'), edge(30, 'P')],
        new: [edge(2, 'Kids/[0]'), edge(30, 'P'), edge(31, 'P')],
      },
    ),
    change(60, { old: null, new: holder }, { new: holderUsage }),
    change(
      31,
      {
        old: null,
        new: '<</F 132/FT /Sig/P 3 0 R/Rect [0 0 0 0]/Subtype /Widget/T (Signature3)/V 32 0 R>>',
      },
      { new: [edge(10, 'Fields/[2]'), edge(60, '[1]')] },
    ),
    change(
      32,
      { old: null, new: '<</SubFilter /ETSI.RFC3161/Type /DocTimeStamp>>' },
      { new: [edge(31, 'V')] },
    ),
    change(
      10,
      {
        old: '<</Fields [20 0 R 30 0 R]/SigFlags 3>>',
        new: '<</Fields [20 0 R 30 0 R 31 0 R]/SigFlags 3>>',
      },
      { old: [edge(1, 'AcroForm')], new: [edge(1, 'AcroForm')] },
    ),
    change(0, { old: '<</Root 1 0 R/Size 60>>', new: '<</Prev 999/Root 1 0 R/Size 61>>' }, {}),
  ];
  const before = structure();
  const after = structure({
    fields: [
      ...structure().fields,
      { objectNumber: 31, name: 'Signature3', kind: 'signature', widgets: [31] },
    ],
    signatures: [
      signature(0, 30),
      signature(1, 31, {
        kind: 'timestamp',
        subFilter: 'ETSI.RFC3161',
        fieldName: 'Signature3',
        revisionIndex: 2,
      }),
    ],
  });
  const judge = (changes: ObjectChange[]) =>
    evaluateStep({ older: 1, newer: 2, changes, before, after });

  test('/Annots moved into an object of its own, with the new widget: permitted', () => {
    const step = judge(moved('[30 0 R 31 0 R]'));
    expect(step.findings.filter((f) => f.verdict !== 'permitted')).toEqual([]);
    expect(step.verdict).toBe('permitted');
    expect(step.findings.find((f) => f.objectNumber === 60)).toMatchObject({
      rule: 'signature-field-added',
      verdict: 'permitted',
    });
  });

  test.each([
    ['drops the old entry', '[31 0 R]'],
    ['holds an annotation written in place', '[30 0 R 31 0 R <</Subtype /Link>>]'],
  ])('a moved /Annots that %s is forbidden', (_, holder) => {
    const step = judge(moved(holder));
    expect(step.verdict).toBe('forbidden');
    expect(step.findings.some((f) => f.objectNumber === 60 && f.verdict === 'permitted')).toBe(
      false,
    );
  });

  // A new signature field explains its own widget joining the end of the list and nothing
  // else. After a certification that allows form filling that is all that may happen to the
  // list. After an approval signature the annotation rule judges the rest, as it does for a
  // list inside the page: where the list is kept changes nothing.
  test.each([
    ['puts the new widget first', '[31 0 R 30 0 R]'],
    ['brings another annotation with it', '[30 0 R 31 0 R 70 0 R]'],
    ['gains nothing', '[30 0 R]'],
  ])('a moved /Annots that %s is not explained by the new field', (_, holder) => {
    const certified = signature(0, 30, { docMdp: 2, catalogCertification: true });
    const step = evaluateStep({
      older: 1,
      newer: 2,
      changes: moved(holder),
      before: structure({ signatures: [certified] }),
      after: { ...after, signatures: [certified, after.signatures[1]] },
    });
    expect(step.verdict).toBe('forbidden');
    expect(step.findings.some((f) => f.objectNumber === 60 && f.verdict === 'permitted')).toBe(
      false,
    );
    const approval = judge(moved(holder));
    expect(
      approval.findings.some((f) => f.objectNumber === 60 && f.rule === 'signature-field-added'),
    ).toBe(false);
  });

  test("a new array that something else also points at is not the page's list alone", () => {
    const step = judge(moved('[30 0 R 31 0 R]', [edge(3, 'Annots'), edge(1, 'Names/Extra')]));
    expect(step.verdict).toBe('forbidden');
  });
});

describe("evaluateStep: a page whose /Annots is an object of its own (Acrobat's way)", () => {
  /** Object 60 is page 3's list: the text field's widget and the signature field. */
  const list = (after: string, uses: ObjectReferrer[] = [edge(3, 'Annots')]): ObjectChange =>
    change(60, { old: '[21 0 R 30 0 R]', new: after }, { old: [edge(3, 'Annots')], new: uses });
  const trailer = change(
    0,
    { old: '<</Root 1 0 R/Size 60>>', new: '<</Prev 999/Root 1 0 R/Size 80>>' },
    {},
  );
  /** A document timestamp in a new field, 31, whose widget joins the list. */
  const newField = (holder: number): ObjectChange[] => [
    change(
      31,
      {
        old: null,
        new: '<</F 132/FT /Sig/P 3 0 R/Rect [0 0 0 0]/Subtype /Widget/T (Signature3)/V 32 0 R>>',
      },
      { new: [edge(10, 'Fields/[2]'), edge(holder, '[2]')] },
    ),
    change(
      32,
      { old: null, new: '<</SubFilter /ETSI.RFC3161/Type /DocTimeStamp>>' },
      { new: [edge(31, 'V')] },
    ),
    change(
      10,
      {
        old: '<</Fields [20 0 R 30 0 R]/SigFlags 3>>',
        new: '<</Fields [20 0 R 30 0 R 31 0 R]/SigFlags 3>>',
      },
      { old: [edge(1, 'AcroForm')], new: [edge(1, 'AcroForm')] },
    ),
  ];
  const withField = structure({
    fields: [
      ...structure().fields,
      { objectNumber: 31, name: 'Signature3', kind: 'signature', widgets: [31] },
    ],
    signatures: [
      signature(0, 30),
      signature(1, 31, {
        kind: 'timestamp',
        subFilter: 'ETSI.RFC3161',
        fieldName: 'Signature3',
        revisionIndex: 2,
      }),
    ],
  });
  /** A square comment with its popup and its appearance, joining the list. */
  const comment: ObjectChange[] = [
    change(
      70,
      { old: null, new: '<</AP <</N 72 0 R>>/P 3 0 R/Popup 71 0 R/Subtype /Square/Type /Annot>>' },
      { new: [edge(60, '[2]'), edge(71, 'Parent')] },
    ),
    change(
      71,
      { old: null, new: '<</Parent 70 0 R/Subtype /Popup/Type /Annot>>' },
      { new: [edge(60, '[3]'), edge(70, 'Popup')] },
    ),
    change(
      72,
      { old: null, new: 'stream(27,ab)<</Subtype /Form/Type /XObject>>' },
      { new: [edge(70, 'AP/N')] },
    ),
  ];
  const refused = (step: ReturnType<typeof evaluateStep>) =>
    step.findings.filter((f) => f.verdict !== 'permitted');

  test('the list grows there by a new signature field: permitted, the page is not written', () => {
    const step = evaluateStep({
      older: 1,
      newer: 2,
      changes: [list('[21 0 R 30 0 R 31 0 R]'), ...newField(60), trailer],
      before: structure(),
      after: withField,
    });
    expect(refused(step)).toEqual([]);
    expect(step.verdict).toBe('permitted');
    expect(step.findings.find((f) => f.objectNumber === 60)).toMatchObject({
      rule: 'signature-field-added',
      verdict: 'permitted',
    });
  });

  test('the list grows there by a comment: permitted for an approval signature, not after P=2', () => {
    const changes = [list('[21 0 R 30 0 R 70 0 R 71 0 R]'), ...comment, trailer];
    const approval = evaluateStep({
      older: 1,
      newer: 2,
      changes,
      before: structure(),
      after: structure(),
    });
    expect(refused(approval)).toEqual([]);
    expect(approval.findings.find((f) => f.objectNumber === 60)).toMatchObject({
      rule: 'annotation',
      verdict: 'permitted',
    });
    const fill = structure({
      signatures: [signature(0, 30, { docMdp: 2, catalogCertification: true })],
    });
    const certified = evaluateStep({ older: 1, newer: 2, changes, before: fill, after: fill });
    expect(certified.verdict).toBe('forbidden');
    expect(
      certified.findings.some(
        (f) => f.objectNumber === 70 && f.rule === 'annotation' && f.verdict === 'forbidden',
      ),
    ).toBe(true);
  });

  test.each([
    ['drops a form widget', '[30 0 R]'],
    ['drops a form widget while a comment joins', '[30 0 R 70 0 R 71 0 R]'],
  ])('a list that %s is forbidden', (_, after) => {
    const step = evaluateStep({
      older: 1,
      newer: 2,
      changes: [list(after), ...comment, trailer],
      before: structure(),
      after: structure(),
    });
    expect(step.verdict).toBe('forbidden');
    expect(step.findings.find((f) => f.objectNumber === 60)).toMatchObject({
      rule: 'annotation',
      verdict: 'forbidden',
      detail: 'page /Annots added or removed a form widget',
    });
  });

  test('a new signature field does not explain a list that also lost an entry', () => {
    const step = evaluateStep({
      older: 1,
      newer: 2,
      changes: [list('[30 0 R 31 0 R]'), ...newField(60), trailer],
      before: structure(),
      after: withField,
    });
    expect(step.verdict).toBe('forbidden');
    expect(
      step.findings.some((f) => f.objectNumber === 60 && f.rule === 'signature-field-added'),
    ).toBe(false);
  });

  test('an array something else also points at is not a page list', () => {
    const step = evaluateStep({
      older: 1,
      newer: 2,
      changes: [
        list('[21 0 R 30 0 R 31 0 R]', [edge(3, 'Annots'), edge(1, 'Names/Extra')]),
        ...newField(60),
        trailer,
      ],
      before: structure(),
      after: withField,
    });
    expect(step.verdict).toBe('forbidden');
    expect(step.findings.some((f) => f.objectNumber === 60 && f.verdict === 'permitted')).toBe(
      false,
    );
  });

  describe('the page points at another list, and the old one stays in the file unwritten', () => {
    // What Acrobat writes for a second timestamp: a fresh list, 61, with the old entries and
    // the new widget. The old list, 60, stays in the file untouched, so it is not a change:
    // the transport reads it from the revision's bytes.
    const replaced = (newList: string): ObjectChange[] => [
      change(
        3,
        {
          old: '<</Annots 60 0 R/Parent 2 0 R/Type /Page>>',
          new: '<</Annots 61 0 R/Parent 2 0 R/Type /Page>>',
        },
        {
          old: [edge(2, 'Kids/[0]'), edge(30, 'P')],
          new: [edge(2, 'Kids/[0]'), edge(30, 'P'), edge(31, 'P')],
        },
      ),
      change(61, { old: null, new: newList }, { new: [edge(3, 'Annots')] }),
      ...newField(61),
      trailer,
    ];
    const oldList = (
      text: string | null,
      read: UnwrittenObject['read'] = 'ok',
    ): UnwrittenObject => ({
      objectNumber: 60,
      value: text === null ? null : parsePdfValue(text),
      read,
    });
    const judge = (newList: string, unwritten?: UnwrittenObject[]) =>
      evaluateStep({
        older: 1,
        newer: 2,
        changes: replaced(newList),
        ...(unwritten ? { unwritten } : {}),
        before: structure(),
        after: withField,
      });
    const refusal = (step: ReturnType<typeof evaluateStep>) => {
      expect(step.verdict).toBe('forbidden');
      const forbidden = step.findings.filter((f) => f.verdict === 'forbidden');
      expect(forbidden).toHaveLength(1);
      expect(forbidden[0]).toMatchObject({ rule: 'annotation', objectNumber: 3 });
      return forbidden[0].detail;
    };

    test('the rules ask for the old list, and for nothing a step wrote', () => {
      const asked = (changes: ObjectChange[]) =>
        unwrittenObjectsToRead({ changes, before: structure(), after: withField });
      expect(asked(replaced('[21 0 R 30 0 R 31 0 R]'))).toEqual([60]);
      // A list the step wrote is read from the step.
      expect(asked([list('[21 0 R 30 0 R 31 0 R]'), ...newField(60), trailer])).toEqual([]);
      // A page that is not written names nothing, whatever else changed.
      expect(asked([...newField(60), trailer])).toEqual([]);
    });

    test('the new list keeps every old entry and adds the new widget: permitted', () => {
      const step = judge('[21 0 R 30 0 R 31 0 R]', [oldList('[21 0 R 30 0 R]')]);
      expect(step.verdict).toBe('permitted');
      expect(step.findings.filter((f) => f.objectNumber === 3)).toEqual([
        expect.objectContaining({ rule: 'signature-field-added', verdict: 'permitted' }),
      ]);
      expect(step.findings.filter((f) => f.objectNumber === 61)).toEqual([
        expect.objectContaining({
          rule: 'signature-field-added',
          verdict: 'permitted',
          detail: expect.stringMatching(/another list object/),
        }),
      ]);
    });

    test('the new list drops an old entry: forbidden', () => {
      const step = judge('[21 0 R 31 0 R]', [oldList('[21 0 R 30 0 R]')]);
      expect(step.verdict).toBe('forbidden');
      expect(
        step.findings.some((f) => f.rule === 'signature-field-added' && f.objectNumber === 3),
      ).toBe(false);
    });

    test('the new list puts the old entries in another order: not explained by the new field', () => {
      const step = judge('[30 0 R 21 0 R 31 0 R]', [oldList('[21 0 R 30 0 R]')]);
      expect(
        step.findings.some((f) => f.rule === 'signature-field-added' && f.objectNumber === 3),
      ).toBe(false);
    });

    test('the old list was not read: one refusal that says so', () => {
      expect(refusal(judge('[21 0 R 30 0 R 31 0 R]'))).toMatch(/cannot be compared/);
    });

    test('the old list does not parse, or is absent: the same refusal', () => {
      expect(refusal(judge('[21 0 R 30 0 R 31 0 R]', [oldList(null, 'failed')]))).toMatch(
        /cannot be compared/,
      );
      expect(refusal(judge('[21 0 R 30 0 R 31 0 R]', [oldList(null, 'absent')]))).toMatch(
        /cannot be compared/,
      );
    });

    test('the old object is not a list of references: the same refusal', () => {
      expect(refusal(judge('[21 0 R 30 0 R 31 0 R]', [oldList('<</Type /Annot>>')]))).toMatch(
        /cannot be compared/,
      );
      expect(refusal(judge('[21 0 R 30 0 R 31 0 R]', [oldList('[21 0 R (text)]')]))).toMatch(
        /cannot be compared/,
      );
    });

    test('a value handed over for an object the step wrote is not read', () => {
      // The step wrote 61 as the old entries and the widget. A transport that also hands it
      // over as something else changes nothing.
      const step = judge('[21 0 R 30 0 R 31 0 R]', [
        oldList('[21 0 R 30 0 R]'),
        { objectNumber: 61, value: parsePdfValue('[99 0 R]'), read: 'ok' },
      ]);
      expect(step.verdict).toBe('permitted');
    });
  });
});

describe('restrictionsFor: a document timestamp after a certification that allows no changes', () => {
  const timestamp = signature(1, 31, {
    kind: 'timestamp',
    subFilter: 'ETSI.RFC3161',
    fieldName: 'Timestamp',
    revisionIndex: 2,
  });
  const after = (permission: 1 | 2, later: Signature) =>
    structure({
      signatures: [signature(0, 30, { docMdp: permission, catalogCertification: true }), later],
    });

  test('the timestamp is judged on its own, as Acrobat judges it', () => {
    const own = restrictionsFor(after(1, timestamp), timestamp);
    expect(own.level).toBe('annotate');
    expect(own.anchors).toEqual([]);
  });

  test('the certification itself, and a later approval signature, stay bound by it', () => {
    const before = after(1, timestamp);
    expect(restrictionsFor(before, before.signatures[0]).level).toBe('lta');
    const approval = signature(1, 31, { fieldName: 'second', revisionIndex: 2 });
    expect(restrictionsFor(after(1, approval), approval).level).toBe('lta');
    // No signature in particular: every restriction in the file applies.
    expect(restrictionsFor(before, null).level).toBe('lta');
  });

  test('a certification that allows form filling still binds a later timestamp', () => {
    expect(restrictionsFor(after(2, timestamp), timestamp).level).toBe('fill');
  });
});

describe("evaluateStep: a push button's image is filling in", () => {
  // A push button 70 with its widget 71 apart, and one whose field and widget
  // are one object, 80. The signature field 30 is signed.
  const buttons = (extra: Partial<Signature> = {}) =>
    structure({
      fields: [
        { objectNumber: 20, name: 'name', kind: 'text', widgets: [21] },
        { objectNumber: 30, name: 'sig0', kind: 'signature', widgets: [30] },
        { objectNumber: 70, name: 'initials', kind: 'pushbutton', widgets: [71] },
        { objectNumber: 80, name: 'image_field', kind: 'pushbutton', widgets: [80] },
        { objectNumber: 85, name: 'agree', kind: 'checkbox', widgets: [85] },
      ],
      signatures: [signature(0, 30, extra)],
    });
  const approval = buttons();
  const fillOnly = buttons({ docMdp: 2, catalogCertification: true });

  /** The drawing a new image is, its appearance drawing it, and the image it holds. */
  const drawn = (owner: number, appearance: number, drawing: number) => [
    change(
      appearance,
      {
        old: null,
        new: `stream(20,cc)<</Resources <</XObject <</FRM ${drawing} 0 R>>>>/Subtype /Form>>`,
      },
      { new: [edge(owner, 'AP/N')] },
    ),
    change(
      drawing,
      {
        old: null,
        new: `stream(30,dd)<</Resources <</XObject <</Im1 ${drawing + 1} 0 R>>>>/Subtype /Form>>`,
      },
      { new: [edge(owner, 'MK/I'), edge(appearance, 'Resources/XObject/FRM')] },
    ),
    change(
      drawing + 1,
      { old: null, new: 'stream(100,ee)<</Subtype /Image>>' },
      { new: [edge(drawing, 'Resources/XObject/Im1')] },
    ),
  ];
  const trailer = change(
    0,
    { old: '<</Root 1 0 R/Size 72>>', new: '<</Prev 1234/Root 1 0 R/Size 95>>' },
    {},
  );

  /** Widget 71's `/MK` and `/AP /N` before and after, its old appearance 72 replaced by 90. */
  const widget = (mkBefore: string, mkAfter: string) => [
    change(
      71,
      {
        old: `<</AP <</N 72 0 R>>/MK ${mkBefore}/Parent 70 0 R/Subtype /Widget>>`,
        new: `<</AP <</N 90 0 R>>/MK ${mkAfter}/Parent 70 0 R/Subtype /Widget>>`,
      },
      {
        old: [edge(3, 'Annots/[3]'), edge(70, 'Kids/[0]')],
        new: [edge(3, 'Annots/[3]'), edge(70, 'Kids/[0]')],
      },
    ),
    change(72, { old: 'stream(10,aa)<</Subtype /Form>>', new: null }, { old: [edge(71, 'AP/N')] }),
  ];
  const imageInWidget = [
    ...widget('<</CA (Initials)/TP 1>>', '<</CA (Initials)/I 91 0 R/TP 1>>'),
    ...drawn(71, 90, 91),
    trailer,
  ];

  const judge = (changes: ObjectChange[], before: RevisionStructure) =>
    evaluateStep({ older: 1, newer: 2, changes, before, after: before });
  const notPermitted = (step: ReturnType<typeof evaluateStep>) =>
    step.findings
      .filter((f) => f.verdict !== 'permitted')
      .map((f) => `${f.rule} ${f.objectNumber}${f.edge ? ` ${f.edge}` : ''}`);

  test('an image put in a widget is permitted after an approval signature and a certification for form filling', () => {
    for (const before of [approval, fillOnly]) {
      const step = judge(imageInWidget, before);
      expect(notPermitted(step)).toEqual([]);
      // Nothing unexplained: the drawing (91) and the image it holds (92) are
      // claimed through /MK /I and the appearance that draws them.
      expect(step.verdict).toBe('permitted');
    }
    expect(judge(imageInWidget, fillOnly).findings.find((f) => f.objectNumber === 71)?.detail).toBe(
      'widget of "initials" image',
    );
  });

  test('an image taken out is permitted as well', () => {
    const out = [
      ...widget('<</CA (Initials)/I 91 0 R/TP 1>>', '<</CA (Initials)/TP 1>>'),
      change(
        90,
        { old: null, new: 'stream(20,cc)<</Subtype /Form>>' },
        { new: [edge(71, 'AP/N')] },
      ),
      change(
        91,
        { old: 'stream(30,dd)<</Subtype /Form>>', new: null },
        { old: [edge(71, 'MK/I')] },
      ),
      trailer,
    ];
    expect(judge(out, fillOnly).verdict).toBe('permitted');
  });

  test('a field and widget in one object: its /MK gains the image and stays permitted at P=2', () => {
    const merged = [
      change(
        80,
        {
          old: '<</AP <</N 81 0 R>>/FT /Btn/Ff 65536/MK <</TP 1>>/Subtype /Widget/T (image_field)>>',
          new: '<</AP <</N 90 0 R>>/FT /Btn/Ff 65536/MK <</I 91 0 R/TP 1>>/Subtype /Widget/T (image_field)>>',
        },
        {
          old: [edge(10, 'Fields/[3]'), edge(3, 'Annots/[4]')],
          new: [edge(10, 'Fields/[3]'), edge(3, 'Annots/[4]')],
        },
      ),
      change(
        81,
        { old: 'stream(10,aa)<</Subtype /Form>>', new: null },
        { old: [edge(80, 'AP/N')] },
      ),
      ...drawn(80, 90, 91),
      trailer,
    ];
    const step = judge(merged, fillOnly);
    expect(notPermitted(step)).toEqual([]);
    expect(step.findings.find((f) => f.objectNumber === 80)?.detail).toBe(
      'push button "image_field" image changed',
    );
  });

  test('a caption, a layout, or both with the image, changed under P=2 stay design: forbidden', () => {
    for (const [before, after] of [
      ['<</CA (Initials)/TP 1>>', '<</CA (Sign here)/TP 1>>'],
      ['<</CA (Initials)/TP 1>>', '<</CA (Initials)/TP 2>>'],
      ['<</CA (Initials)/TP 1>>', '<</CA (Sign here)/I 91 0 R/TP 1>>'],
    ] as const) {
      const changes = [...widget(before, after), ...drawn(71, 90, 91), trailer];
      const step = judge(changes, fillOnly);
      expect(step.verdict).toBe('forbidden');
      expect(step.findings.find((f) => f.objectNumber === 71)).toMatchObject({
        verdict: 'forbidden',
        rule: 'form-fill',
        detail: 'widget of "initials" keys changed: MK',
      });
      // After an approval signature the key table allows /MK as a whole.
      expect(judge(changes, approval).verdict).toBe('permitted');
    }
  });

  test('a push button a signature locked stays frozen: an image put in is forbidden at every level', () => {
    for (const lock of [
      { fieldMdp: { action: 'include' as const, fields: ['initials'] } },
      {
        fieldMdp: { action: 'include' as const, fields: ['initials'] },
        docMdp: 2 as const,
        catalogCertification: true,
      },
    ]) {
      const step = judge(imageInWidget, buttons(lock));
      expect(step.verdict).toBe('forbidden');
      expect(step.findings.find((f) => f.objectNumber === 71)).toMatchObject({
        verdict: 'forbidden',
        rule: 'field-lock',
      });
    }
  });

  test("another kind's /MK /I is not a push button's image: it stays unexplained", () => {
    const checkbox = [
      change(
        85,
        {
          old: '<</AP <</N 86 0 R>>/FT /Btn/MK <</CA (4)>>/Subtype /Widget/T (agree)>>',
          new: '<</AP <</N 90 0 R>>/FT /Btn/MK <</CA (4)/I 91 0 R>>/Subtype /Widget/T (agree)>>',
        },
        {
          old: [edge(10, 'Fields/[4]'), edge(3, 'Annots/[5]')],
          new: [edge(10, 'Fields/[4]'), edge(3, 'Annots/[5]')],
        },
      ),
      change(
        86,
        { old: 'stream(10,aa)<</Subtype /Form>>', new: null },
        { old: [edge(85, 'AP/N')] },
      ),
      ...drawn(85, 90, 91),
      trailer,
    ];
    const step = judge(checkbox, approval);
    expect(step.verdict).toBe('forbidden');
    expect(notPermitted(step)).toContain('unexplained 91 85:MK/I');
  });
});
