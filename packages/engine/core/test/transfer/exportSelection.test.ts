import { describe, expect, test } from 'vitest';
import type { AnnotationDTO } from '../../src/annotation/kinds';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import type { AnnotationRef } from '../../src/identity/AnnotationRef';
import { toPageRef, type PageRef } from '../../src/identity/PageRef';
import { closeExportSelection } from '../../src/transfer/exportSelection';

const first = toPageRef(3);
const second = toPageRef(7);
const pages = [first, second];

const refOf = (page: PageRef, annotObjectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page,
  annotObjectNumber,
});

/** An annotation as a read returns it, with only what the closure looks at. */
function annotation(
  page: PageRef,
  annotObjectNumber: number,
  index: number,
  fields: Record<string, unknown> = {},
): AnnotationDTO {
  return {
    subtype: 'text',
    ref: refOf(page, annotObjectNumber),
    index,
    nm: null,
    reply: null,
    popup: null,
    ...fields,
  } as unknown as AnnotationDTO;
}

/**
 * The first page holds a comment thread: a note (10) with its popup (11), a
 * reply to it (12), a reply to that reply (13) and another reply to the note
 * (14). A reply is on its parent's page (ISO 32000-2 §12.5.6.2). The second
 * page holds an unrelated square (21).
 */
const document: Record<number, AnnotationDTO[]> = {
  3: [
    annotation(first, 10, 0, { popup: refOf(first, 11) }),
    annotation(first, 11, 1, { subtype: 'popup', parent: refOf(first, 10) }),
    annotation(first, 12, 2, { reply: { to: refOf(first, 10), type: 'reply' } }),
    annotation(first, 13, 3, { reply: { to: refOf(first, 12), type: 'reply' } }),
    annotation(first, 14, 4, { reply: { to: refOf(first, 10), type: 'reply' } }),
  ],
  7: [annotation(second, 21, 0, { subtype: 'square' })],
};

function exported(selection: Parameters<typeof closeExportSelection>[0]) {
  const reads: number[] = [];
  const annotations = closeExportSelection(selection, pages, (page) => {
    reads.push(page.pageObjectNumber);
    return document[page.pageObjectNumber] ?? [];
  });
  const objectNumbers = annotations.map((item) =>
    item.ref.kind === 'objectNumber' ? item.ref.annotObjectNumber : -1,
  );
  return { objectNumbers, reads };
}

describe('closeExportSelection', () => {
  test('takes every annotation, in document order, without a selection', () => {
    expect(exported({}).objectNumbers).toEqual([10, 11, 12, 13, 14, 21]);
  });

  test('takes a comment with its whole thread by default, reading only its page', () => {
    const { objectNumbers, reads } = exported({ refs: [refOf(first, 10)] });
    expect(objectNumbers).toEqual([10, 11, 12, 13, 14]);
    expect(reads).toEqual([3]);
  });

  test('takes only what a selection points at with references', () => {
    const only = (ref: AnnotationRef) =>
      exported({ refs: [ref], include: 'references' }).objectNumbers;
    // A reply brings its parents up to the root, and the root its popup.
    expect(only(refOf(first, 13))).toEqual([10, 11, 12, 13]);
    // A comment brings its popup, and none of its replies.
    expect(only(refOf(first, 10))).toEqual([10, 11]);
    // A popup brings its parent.
    expect(only(refOf(first, 11))).toEqual([10, 11]);
  });

  test('takes the replies below a reply, and its parents', () => {
    expect(exported({ refs: [refOf(first, 12)] }).objectNumbers).toEqual([10, 11, 12, 13]);
  });

  test('takes a popup as its comment, thread included', () => {
    expect(exported({ refs: [refOf(first, 11)] }).objectNumbers).toEqual([10, 11, 12, 13, 14]);
  });

  test('takes a page whole', () => {
    const { objectNumbers, reads } = exported({ pages: [second] });
    expect(objectNumbers).toEqual([21]);
    expect(reads).toEqual([7]);
  });

  test('finds an annotation by name and by position', () => {
    const named = { ...document };
    named[3] = [
      annotation(first, 10, 0, { nm: 'note', popup: refOf(first, 11) }),
      ...document[3]!.slice(1),
    ];
    const read = (page: PageRef) => named[page.pageObjectNumber] ?? [];
    const byName = closeExportSelection(
      { refs: [{ kind: 'nm', page: first, nm: 'note' }], include: 'references' },
      pages,
      read,
    );
    expect(byName.map((item) => item.index)).toEqual([0, 1]);
    const byPosition = closeExportSelection(
      { refs: [{ kind: 'index', page: first, index: 1 } as AnnotationRef], include: 'references' },
      pages,
      read,
    );
    expect(byPosition.map((item) => item.index)).toEqual([0, 1]);
  });

  test('refuses a page or an annotation the document does not have', () => {
    for (const selection of [{ pages: [toPageRef(99)] }, { refs: [refOf(first, 99)] }]) {
      expect(() => closeExportSelection(selection, pages, () => [])).toThrow(
        expect.objectContaining({ code: EngineErrorCode.NotFound }),
      );
    }
  });
});
