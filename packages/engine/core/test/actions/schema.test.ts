import { describe, expect, test } from 'vitest';

import type { PdfActionNode } from '../../src/dto/PdfAction';
import { decodeSubmitFormFlags } from '../../src/dto/PdfAction';
import { DocumentActionsSnapshotSchema, PdfActionTreeSchema } from '../../src/dto/PdfAction.schema';

/** One explicit fixture per union arm — the round-trip spec for the node
 *  vocabulary. A new action type without a row here fails the count check. */
const ARM_FIXTURES: PdfActionNode[] = [
  { type: 'javascript', subtype: 'JavaScript', script: 'boot()', next: [] },
  {
    type: 'goto',
    subtype: 'GoTo',
    destination: { kind: 'fitR', pageObjectNumber: 3, left: 1, bottom: 2, right: 3, top: 4 },
    next: [],
  },
  { type: 'uri', subtype: 'URI', uri: 'https://example.test/?a=1', isMap: true, next: [] },
  { type: 'named', subtype: 'Named', name: 'NextPage', next: [] },
  {
    type: 'hide',
    subtype: 'Hide',
    targets: [
      { kind: 'name', name: 'note1' },
      { kind: 'objectNumber', objectNumber: 42 },
    ],
    hide: false,
    next: [],
  },
  { type: 'reset-form', subtype: 'ResetForm', fields: null, exclude: false, next: [] },
  {
    type: 'reset-form',
    subtype: 'ResetForm',
    fields: [{ kind: 'name', name: 'calc1' }],
    exclude: true,
    next: [],
  },
  { type: 'goto-remote', subtype: 'GoToR', filePath: 'other.pdf', next: [] },
  { type: 'goto-embedded', subtype: 'GoToE', filePath: 'embedded.pdf', next: [] },
  { type: 'launch', subtype: 'Launch', filePath: 'app.exe', next: [] },
  { type: 'rendition', subtype: 'Rendition', script: 'play()', next: [] },
  { type: 'rendition', subtype: 'Rendition', next: [] },
  // Both submit-form states: pre-payload skew (older runtime) and the
  // atomic payload.
  { type: 'submit-form', subtype: 'SubmitForm', next: [] },
  {
    type: 'submit-form',
    subtype: 'SubmitForm',
    payload: {
      url: 'https://example.test/submit',
      fields: [
        { kind: 'name', name: 'billing' },
        { kind: 'objectNumber', objectNumber: 12 },
      ],
      flags: decodeSubmitFormFlags(0b100010),
      charSet: 'utf-8',
    },
    next: [],
  },
  {
    type: 'submit-form',
    subtype: 'SubmitForm',
    payload: {
      url: 'https://example.test/all',
      fields: null,
      flags: decodeSubmitFormFlags(0),
    },
    next: [],
  },
  { type: 'thread', subtype: 'Thread', next: [] },
  { type: 'sound', subtype: 'Sound', next: [] },
  { type: 'movie', subtype: 'Movie', next: [] },
  { type: 'import-data', subtype: 'ImportData', next: [] },
  { type: 'set-ocg-state', subtype: 'SetOCGState', next: [] },
  { type: 'transition', subtype: 'Trans', next: [] },
  { type: 'goto-3d-view', subtype: 'GoTo3DView', next: [] },
  { type: 'unknown', subtype: 'FutureAction', next: [] },
];

describe('PDF action schemas', () => {
  test('round-trips every union arm and recursive /Next order', () => {
    const distinctTypes = new Set(ARM_FIXTURES.map((node) => node.type));
    expect(distinctTypes.size).toBe(19);
    const tree = {
      root: {
        type: 'javascript' as const,
        subtype: 'JavaScript',
        script: 'boot()',
        next: ARM_FIXTURES,
      },
      incomplete: false,
      warningFlags: 0,
      warnings: [],
    };
    expect(PdfActionTreeSchema.parse(tree)).toEqual(tree);
  });

  test('payload-less executable arms are unrepresentable', () => {
    for (const bare of [
      { type: 'goto', subtype: 'GoTo', next: [] },
      { type: 'uri', subtype: 'URI', next: [] },
      { type: 'named', subtype: 'Named', next: [] },
      { type: 'hide', subtype: 'Hide', next: [] },
      { type: 'reset-form', subtype: 'ResetForm', next: [] },
      { type: 'javascript', subtype: 'JavaScript', next: [] },
    ]) {
      const tree = { root: bare, incomplete: false, warningFlags: 0, warnings: [] };
      expect(PdfActionTreeSchema.safeParse(tree).success).toBe(false);
    }
  });

  test('decodeSubmitFormFlags — the ISO Table 240 bit contract', () => {
    const bit = (n: number) => 1 << (n - 1);

    // Default word: FDF via POST, include mode, nothing else.
    expect(decodeSubmitFormFlags(0)).toEqual({
      raw: 0,
      exclude: false,
      includeNoValueFields: false,
      format: 'fdf',
      method: 'post',
      submitCoordinates: false,
      includeAppendSaves: false,
      includeAnnotations: false,
      canonicalFormat: false,
      exclNonUserAnnots: false,
      exclFKey: false,
      embedForm: false,
    });

    // Format precedence: SubmitPDF (bit 9) dominates XFDF (6) and
    // ExportFormat (3); XFDF beats ExportFormat.
    expect(decodeSubmitFormFlags(bit(9) | bit(6) | bit(3)).format).toBe('pdf');
    expect(decodeSubmitFormFlags(bit(6) | bit(3)).format).toBe('xfdf');
    expect(decodeSubmitFormFlags(bit(3)).format).toBe('html');

    // GetMethod (bit 4) is meaningful only for HTML — and stays alive under
    // SubmitPDF per the bit-9 "all other flags ignored EXCEPT GetMethod"
    // rule. For FDF/XFDF it decodes to post.
    expect(decodeSubmitFormFlags(bit(4) | bit(3)).method).toBe('get');
    expect(decodeSubmitFormFlags(bit(4) | bit(9)).method).toBe('get');
    expect(decodeSubmitFormFlags(bit(4)).method).toBe('post');
    expect(decodeSubmitFormFlags(bit(4) | bit(6)).method).toBe('post');

    // The two easily-missed positions, pinned against ISO 32000-2:2020:
    // bit 12 is ExclFKey; bit 13 is reserved; EmbedForm is bit 14 (8192).
    expect(decodeSubmitFormFlags(bit(12)).exclFKey).toBe(true);
    // Reserved bit 13: raw is carried, semantics are untouched.
    expect({ ...decodeSubmitFormFlags(bit(13)), raw: 0 }).toEqual(decodeSubmitFormFlags(0));
    expect(decodeSubmitFormFlags(bit(14)).embedForm).toBe(true);
    expect(decodeSubmitFormFlags(8192).embedForm).toBe(true);

    // Exclude is DERIVED from bit 1 — the raw word is the single source.
    const excluding = decodeSubmitFormFlags(bit(1) | bit(2) | bit(5) | bit(7) | bit(8) | bit(10) | bit(11));
    expect(excluding.exclude).toBe(true);
    expect(excluding.includeNoValueFields).toBe(true);
    expect(excluding.submitCoordinates).toBe(true);
    expect(excluding.includeAppendSaves).toBe(true);
    expect(excluding.includeAnnotations).toBe(true);
    expect(excluding.canonicalFormat).toBe(true);
    expect(excluding.exclNonUserAnnots).toBe(true);
  });

  test('a half submit payload is unrepresentable', () => {
    for (const partial of [
      { url: 'https://example.test' }, // no fields/flags
      { fields: null, flags: decodeSubmitFormFlags(0) }, // no url
    ]) {
      const tree = {
        root: { type: 'submit-form', subtype: 'SubmitForm', payload: partial, next: [] },
        incomplete: false,
        warningFlags: 0,
        warnings: [],
      };
      expect(PdfActionTreeSchema.safeParse(tree).success).toBe(false);
    }
  });

  test('accepts an incomplete model with a null root and raw warning flags', () => {
    const tree = {
      root: null,
      incomplete: true,
      warningFlags: 0x8000_0004,
      warnings: ['incomplete' as const, 'payload-dropped' as const],
    };
    expect(PdfActionTreeSchema.parse(tree)).toEqual(tree);
  });

  test('catalog snapshot keeps name-tree order and defaults openDestination', () => {
    const action = {
      root: { type: 'javascript' as const, subtype: 'JavaScript', script: '', next: [] },
      incomplete: false,
      warningFlags: 0,
      warnings: [],
    };
    const snapshot = {
      nameTreeScripts: [
        { name: 'first', action },
        { name: 'second', action },
      ],
      openAction: null,
      willSave: action,
    };
    // A pre-payload response (no openDestination key) parses and gains the key.
    expect(DocumentActionsSnapshotSchema.parse(snapshot)).toEqual({
      ...snapshot,
      openDestination: null,
    });
  });

  test('carries a destination-form OpenAction and rejects both forms at once', () => {
    const destination = { kind: 'xyz' as const, pageObjectNumber: 5, left: 10, top: 700, zoom: 1.5 };
    const withDestination = {
      nameTreeScripts: [],
      openAction: null,
      openDestination: destination,
    };
    expect(DocumentActionsSnapshotSchema.parse(withDestination)).toEqual(withDestination);

    const bothForms = {
      nameTreeScripts: [],
      openAction: {
        root: { type: 'javascript' as const, subtype: 'JavaScript', script: '', next: [] },
        incomplete: false,
        warningFlags: 0,
        warnings: [],
      },
      openDestination: destination,
    };
    expect(DocumentActionsSnapshotSchema.safeParse(bothForms).success).toBe(false);
  });
});
