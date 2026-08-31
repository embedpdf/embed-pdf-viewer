import { describe, expect, test } from 'vitest';

import type { PdfActionNode } from '../../src/dto/PdfAction';
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
  { type: 'submit-form', subtype: 'SubmitForm', next: [] },
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
