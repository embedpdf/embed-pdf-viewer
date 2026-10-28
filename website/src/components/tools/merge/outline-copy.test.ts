import type { OutlineItem, PageRef } from '@embedpdf/engine';
import { describe, expect, it } from 'vitest';

import { outlineCopy } from './outline-copy';

const page = (objectNumber: number): PageRef => ({ kind: 'objectNumber', objectNumber });
const ref = (objectNumber: number) => ({ kind: 'objectNumber', objectNumber }) as const;

const item = (number: number, title: string, rest: Partial<OutlineItem> = {}): OutlineItem => ({
  ref: ref(number),
  parent: null,
  title,
  target: null,
  action: null,
  open: false,
  color: null,
  bold: false,
  italic: false,
  ...rest,
});

const source = [page(4), page(9), page(12)];
const inserted = [page(101), page(102), page(103)];

describe('outlineCopy', () => {
  it('points each bookmark at the page its file page became, keeping the place on it', () => {
    const [step] = outlineCopy(
      [
        item(1, 'Results', {
          target: {
            kind: 'goto',
            destination: { kind: 'xyz', page: page(9), x: 0, y: 120, zoom: null },
          },
        }),
      ],
      source,
      inserted,
    );
    expect(step!.draft).toEqual({
      title: 'Results',
      target: {
        kind: 'goto',
        destination: { kind: 'xyz', page: page(102), x: 0, y: 120, zoom: null },
      },
    });
  });

  it('keeps the tree: parents first, children naming them', () => {
    const steps = outlineCopy(
      [item(1, 'Chapter'), item(2, 'Section', { parent: ref(1) }), item(3, 'Appendix')],
      source,
      inserted,
    );
    expect(
      steps.map((step) => [step.source.objectNumber, step.parent?.objectNumber ?? null]),
    ).toEqual([
      [1, null],
      [2, 1],
      [3, null],
    ]);
  });

  it('keeps web links, page turns and the title style', () => {
    const steps = outlineCopy(
      [
        item(1, 'Site', {
          target: { kind: 'uri', uri: 'https://example.com' },
          bold: true,
          color: '#ff0000',
        }),
        item(2, 'Next', { target: { kind: 'named', name: 'NextPage' }, italic: true }),
      ],
      source,
      inserted,
    );
    expect(steps.map((step) => step.draft)).toEqual([
      {
        title: 'Site',
        target: { kind: 'uri', uri: 'https://example.com' },
        color: '#ff0000',
        bold: true,
      },
      { title: 'Next', target: { kind: 'named', name: 'NextPage' }, italic: true },
    ]);
  });

  it('keeps a bookmark it cannot write the target of as a title, so the tree keeps its shape', () => {
    const steps = outlineCopy(
      [
        item(2, 'Script', { target: { kind: 'javascript' } }),
        item(3, 'Other file', { target: { kind: 'goto-remote', file: 'b.pdf' } }),
        item(4, 'Print', { target: { kind: 'named', name: 'Print' } }),
        item(5, 'Heading'),
      ],
      source,
      inserted,
    );
    expect(steps.map((step) => step.draft)).toEqual([
      { title: 'Script' },
      { title: 'Other file' },
      { title: 'Print' },
      { title: 'Heading' },
    ]);
  });

  it('leaves out bookmarks to pages that were not merged', () => {
    // Pages 4 and 12 merged, page 9 left out.
    const steps = outlineCopy(
      [
        item(1, 'Intro', { target: { kind: 'goto', destination: { kind: 'fit', page: page(4) } } }),
        item(2, 'Left out', {
          target: { kind: 'goto', destination: { kind: 'fit', page: page(9) } },
        }),
        item(3, 'Gone', { target: { kind: 'goto', destination: { kind: 'fit', page: page(77) } } }),
      ],
      [page(4), page(12)],
      [page(201), page(202)],
    );
    expect(steps.map((step) => step.draft.title)).toEqual(['Intro']);
  });

  it('keeps a bookmark to a page left out as the heading of the bookmarks under it that stay', () => {
    const goto = (objectNumber: number) =>
      ({ kind: 'goto', destination: { kind: 'fit', page: page(objectNumber) } }) as const;
    const steps = outlineCopy(
      [
        item(1, 'Chapter', { target: goto(9) }),
        item(2, 'Section', { parent: ref(1), target: goto(9) }),
        item(3, 'Subsection', { parent: ref(2), target: goto(12) }),
        item(4, 'Other chapter', { target: goto(9) }),
        item(5, 'Its section', { parent: ref(4), target: goto(9) }),
      ],
      [page(4), page(12)],
      [page(201), page(202)],
    );
    expect(steps.map((step) => [step.draft.title, step.draft.target ?? null])).toEqual([
      ['Chapter', null],
      ['Section', null],
      ['Subsection', { kind: 'goto', destination: { kind: 'fit', page: page(202) } }],
    ]);
  });
});
