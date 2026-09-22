import { describe, expect, test } from 'vitest';
import {
  changedKeys,
  evaluateStep,
  parsePdfValue,
  restrictionsOf,
  stableStringify,
  type ObjectChange,
  type ObjectReferrer,
  type RevisionStructure,
  type SignatureDTO,
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
  extra: Partial<SignatureDTO> = {},
): SignatureDTO {
  return {
    index,
    field: { kind: 'objectNumber', fieldObjectNumber },
    fieldName: `sig${index}`,
    widget: null,
    signed: true,
    kind: 'signature',
    filter: 'Adobe.PPKLite',
    subFilter: 'ETSI.CAdES.detached',
    byteRange: [0, 100, 200, 100],
    contentsSize: 8,
    coverage: 'whole-revision',
    revisionIndex: 1,
    signer: { name: null, reason: null, location: null, contactInfo: null, claimedTime: null },
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
      { objectNumber: 20, name: 'name', family: 'text', widgets: [21] },
      { objectNumber: 30, name: 'sig0', family: 'signature', widgets: [30] },
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
      { old: '<</Type /Page/Parent 2 0 R/Contents 40 0 R>>', new: '<</Type /Page/Parent 2 0 R/Contents 41 0 R>>' },
      { old: [edge(2, 'Kids/[0]')], new: [edge(2, 'Kids/[0]')] },
    );
    const tooBig = change(
      50,
      { old: '<</X 1>>', new: '<</X 2>>' },
      { old: [edge(1, 'Big')], new: [edge(1, 'Big')] },
      { value: { old: null, new: null, truncated: true } },
    );
    const step = evaluateStep({ older: 1, newer: 2, changes: [pageContent, tooBig], before, after: before });
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
      evaluateStep({ older: 1, newer: 2, changes: [fill], before, after: before, health: { old: healthy, new: healthy } }).verdict,
    ).toBe('permitted');
    for (const sick of [
      { ...healthy, sparseXref: true },
      { ...healthy, bareReferences: 1 },
    ]) {
      const step = evaluateStep({ older: 1, newer: 2, changes: [fill], before, after: before, health: { old: sick, new: healthy } });
      expect(step.verdict).toBe('indeterminate');
      expect(step.findings.find((f) => f.rule === 'base-unverifiable')).toMatchObject({ verdict: 'incomplete', objectNumber: 0 });
      expect(step.findings.find((f) => f.rule === 'base-unverifiable')!.detail).toMatch(/Acrobat/);
    }
    // The newer revision's health is not the sealed revision's problem...
    expect(
      evaluateStep({ older: 1, newer: 2, changes: [fill], before, after: before, health: { old: healthy, new: { ...healthy, sparseXref: true } } }).verdict,
    ).toBe('permitted');
    // ...but an incomplete reachability walk on either side leaves every use unproven.
    const walked = evaluateStep({ older: 1, newer: 2, changes: [fill], before, after: before, health: { old: healthy, new: { ...healthy, referrersComplete: false } } });
    expect(walked.verdict).toBe('indeterminate');
    expect(walked.findings.some((f) => f.rule === 'unexplained' && f.verdict === 'incomplete')).toBe(true);
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
      { old: '<</Type /Page/Parent 2 0 R/Annots [30 0 R]>>', new: '<</Type /Page/Parent 2 0 R/Annots [30 0 R]>>' },
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
        evaluateStep({ older: 1, newer: 2, changes: [samePage], before: certified, after: certified }).verdict,
      ).toBe('unchanged');
    }
  });

  test('an identical rewrite before the first signature is no change either', () => {
    const unsigned = structure({ signatures: [signature(0, 30, { signed: false })] });
    const samePage = change(
      3,
      { old: '<</Type /Page/Parent 2 0 R/Annots [30 0 R]>>', new: '<</Type /Page/Parent 2 0 R/Annots [30 0 R]>>' },
      { old: [edge(2, 'Kids/[0]')], new: [edge(2, 'Kids/[0]')] },
    );
    const step = evaluateStep({ older: 0, newer: 1, changes: [samePage], before: unsigned, after: unsigned });
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
    expect(
      forbidden.findings.some((f) => f.rule === 'form-fill' && f.verdict === 'forbidden'),
    ).toBe(true);
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

  test('metadata, info, trailer housekeeping and DSS are permitted even under lta', () => {
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
    const step = evaluateStep({ older: 1, newer: 2, changes, before: lta, after: lta });
    expect(step.findings.filter((f) => f.verdict === 'forbidden')).toEqual([]);
    expect(step.verdict).toBe('permitted');
  });

  test('a second signature with a FieldMDP lock is permitted; touching the locked field afterwards is not', () => {
    const before = structure({
      fields: [
        { objectNumber: 20, name: 'name', family: 'text', widgets: [21] },
        { objectNumber: 30, name: 'sig0', family: 'signature', widgets: [30] },
        { objectNumber: 60, name: 'sig1', family: 'signature', widgets: [60] },
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
        { objectNumber: 60, name: 'sig1', family: 'signature', widgets: [60] },
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
    expect(step.findings.some((f) => f.objectNumber === 63 && f.verdict === 'permitted')).toBe(true);

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
      signatures: [signature(0, 30, { docMdp: 2, catalogCertification: true }), after.signatures[1]],
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
        { objectNumber: 60, name: 'sig1', family: 'signature', widgets: [60] },
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
    const step = evaluateStep({
      older: 1,
      newer: 2,
      changes,
      before: certifiedLta,
      after: certifiedLta,
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
        { objectNumber: 20, name: 'name', family: 'text', widgets: [21] },
        { objectNumber: 30, name: 'sig0', family: 'signature', widgets: [30] },
        { objectNumber: 60, name: 'sig1', family: 'signature', widgets: [60] },
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
        { objectNumber: 20, name: 'name', family: 'text', widgets: [21], flags: 4096 },
        { objectNumber: 30, name: 'sig0', family: 'signature', widgets: [30] },
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
        { objectNumber: 40, name: 'other', family: 'text', widgets: [40] },
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
