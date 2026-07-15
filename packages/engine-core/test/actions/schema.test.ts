import { describe, expect, test } from 'vitest';

import { DocumentActionsSnapshotSchema, PdfActionTreeSchema } from '../../src/dto/PdfAction.schema';

describe('PDF action schemas', () => {
  test('preserves every normalized action type and recursive /Next order', () => {
    const types = [
      'unknown',
      'goto',
      'goto-remote',
      'goto-embedded',
      'launch',
      'thread',
      'uri',
      'sound',
      'movie',
      'hide',
      'named',
      'submit-form',
      'reset-form',
      'import-data',
      'javascript',
      'set-ocg-state',
      'rendition',
      'transition',
      'goto-3d-view',
    ] as const;
    const tree = {
      root: {
        type: 'javascript' as const,
        subtype: 'JavaScript',
        script: 'boot()',
        next: types.map((type) => ({ type, subtype: type, next: [] })),
      },
      incomplete: false,
      warningFlags: 0,
      warnings: [],
    };
    expect(PdfActionTreeSchema.parse(tree)).toEqual(tree);
  });

  test('accepts an incomplete model with a null root and raw warning flags', () => {
    const tree = {
      root: null,
      incomplete: true,
      warningFlags: 0x8000_0004,
      warnings: ['incomplete' as const],
    };
    expect(PdfActionTreeSchema.parse(tree)).toEqual(tree);
  });

  test('catalog snapshot keeps name-tree order and a destination OpenAction as null', () => {
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
    expect(DocumentActionsSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });
});
