import { describe, expect, test } from 'vitest';
import type { AnnotationRef } from '../../src/identity/AnnotationRef';
import { toPageRef } from '../../src/identity/PageRef';
import { decodeAnnotationsExportToken, encodeAnnotationsExportToken } from '../../src/wire/tokens';

const pins = { annotationsVersion: 4, layoutVersion: 2 };
const page = toPageRef(3);
const byNumber = (annotObjectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page,
  annotObjectNumber,
});

describe('the annotation export token', () => {
  test('is the two pins alone for the whole document with its threads', () => {
    expect(encodeAnnotationsExportToken({ ...pins, selection: {} })).toBe(
      'annotationsVersion=4,layoutVersion=2',
    );
  });

  test('is one token for one selection, whatever its order or repeats', () => {
    const one = encodeAnnotationsExportToken({
      ...pins,
      selection: { refs: [byNumber(12), byNumber(10)], pages: [toPageRef(9), page] },
    });
    const other = encodeAnnotationsExportToken({
      ...pins,
      selection: {
        refs: [byNumber(10), byNumber(12), byNumber(10)],
        pages: [page, toPageRef(9), page],
      },
    });
    expect(one).toBe(other);
  });

  test('round-trips pins, pages, refs by number and name, and include', () => {
    const selection = {
      refs: [byNumber(10), { kind: 'nm', page, nm: 'Café · review' } as AnnotationRef],
      pages: [page],
      include: 'references' as const,
    };
    const decoded = decodeAnnotationsExportToken(
      encodeAnnotationsExportToken({ ...pins, selection }),
    );
    expect(decoded.annotationsVersion).toBe(4);
    expect(decoded.layoutVersion).toBe(2);
    expect(decoded.selection.include).toBe('references');
    expect(decoded.selection.pages).toEqual([page]);
    expect(decoded.selection.refs).toEqual(expect.arrayContaining(selection.refs));
    expect(decoded.selection.refs).toHaveLength(2);
  });

  test('keeps an empty page list apart from no page list', () => {
    const none = decodeAnnotationsExportToken(
      encodeAnnotationsExportToken({ ...pins, selection: { pages: [] } }),
    );
    expect(none.selection.pages).toEqual([]);
  });

  test('refuses a weak ref, which has no durable address', () => {
    expect(() =>
      encodeAnnotationsExportToken({
        ...pins,
        selection: { refs: [{ kind: 'index', page, index: 0 } as AnnotationRef] },
      }),
    ).toThrow(/not by position/);
  });

  test.each([
    'annotationsVersion=4',
    'annotationsVersion=4,include=threads,layoutVersion=2',
    'annotationsVersion=4,layoutVersion=2,selection=bm90IGpzb24',
    'annotationsVersion=0,layoutVersion=2',
  ])('refuses the malformed token %s', (token) => {
    expect(() => decodeAnnotationsExportToken(token)).toThrow();
  });
});
