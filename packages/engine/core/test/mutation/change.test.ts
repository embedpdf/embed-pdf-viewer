import { describe, expect, it } from 'vitest';

import {
  objectNumbersNamedBy,
  objectNumbersReferencedBy,
  type Change,
} from '../../src/mutation/Change';
import { toPageRef } from '../../src/identity/PageRef';

const page = toPageRef(3);
const annotation = (objectNumber: number) => ({
  kind: 'objectNumber' as const,
  page,
  objectNumber,
});

describe('the object numbers a change names and refers to', () => {
  it('names the numbers its creates take, and refers to every ref in its ops', () => {
    const change = {
      ops: [
        {
          type: 'annotations.create',
          page,
          objectNumber: 40,
          data: { subtype: 'text', reply: { type: 'reply', to: annotation(12) } },
        },
        { type: 'annotations.update', ref: annotation(13), patch: { contents: 'x' } },
        {
          type: 'forms.setValue',
          field: { kind: 'objectNumber', objectNumber: 21 },
          value: { value: 'a' },
        },
        { type: 'annotations.reorder', page, refs: [annotation(14)], position: { kind: 'top' } },
      ],
    } as unknown as Change;
    expect(objectNumbersNamedBy(change)).toEqual([40]);
    // The page is a ref too: page numbers never collide with created ones.
    expect(objectNumbersReferencedBy(change).sort((a, b) => a - b)).toEqual([3, 12, 13, 14, 21]);
  });

  it('an undo refers to nothing: it names its change', () => {
    expect(objectNumbersReferencedBy({ undoOf: 'op-1' })).toEqual([]);
  });

  it('looks past bytes', () => {
    const change = {
      ops: [
        {
          type: 'annotations.update',
          ref: annotation(13),
          patch: {},
          resources: { appearance: new Uint8Array([1, 2, 3]) },
        },
      ],
    } as unknown as Change;
    expect(objectNumbersReferencedBy(change).sort((a, b) => a - b)).toEqual([3, 13]);
  });
});
