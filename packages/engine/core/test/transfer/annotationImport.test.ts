import { describe, expect, test } from 'vitest';
import type { AnnotationDTO } from '../../src/annotation/kinds';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import type { AnnotationRef } from '../../src/identity/AnnotationRef';
import { encodePageKey, toPageRef, type PageRef } from '../../src/identity/PageRef';
import type { AnnotationBundle } from '../../src/transfer/AnnotationBundle';
import {
  planAnnotationImport,
  type AnnotationImportPages,
  type AnnotationImportTarget,
} from '../../src/transfer/annotationImport';

const box = { left: 10, bottom: 10, right: 40, top: 30 };
const first = toPageRef(3);
const second = toPageRef(7);
const refOf = (page: PageRef, annotObjectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page,
  annotObjectNumber,
});

/** An annotation as a read returns it, with the fields the plan looks at. */
function annotation(
  page: PageRef,
  annotObjectNumber: number,
  index: number,
  fields: Record<string, unknown> = {},
): AnnotationDTO {
  return {
    subtype: 'square',
    ref: refOf(page, annotObjectNumber),
    page,
    index,
    identityQuality: 'durable',
    nm: null,
    rect: box,
    reply: null,
    popup: null,
    ...fields,
  } as unknown as AnnotationDTO;
}

function bundleOf(...items: AnnotationDTO[]): Pick<AnnotationBundle, 'pages' | 'items'> {
  const pages = [first, second]
    .filter((page) =>
      items.some((item) => item.ref.page.pageObjectNumber === page.pageObjectNumber),
    )
    .map((page, position) => ({ page, position: position === 0 ? 0 : 4, box }));
  return { pages, items: items.map((data) => ({ data, resources: {} })) };
}

/** The same two pages, at positions 0 and 4. */
const sameDocument: AnnotationImportTarget[] = [
  { page: first, position: 0 },
  { page: second, position: 4 },
];

function plan(
  bundle: Pick<AnnotationBundle, 'pages' | 'items'>,
  options: {
    pages?: AnnotationImportPages;
    target?: AnnotationImportTarget[];
    taken?: string[];
  } = {},
) {
  return planAnnotationImport({
    bundle,
    ...(options.pages ? { pages: options.pages } : {}),
    target: options.target ?? sameDocument,
    nameTaken: (page, nm) => (options.taken ?? []).includes(`${encodePageKey(page)}:${nm}`),
  });
}

describe('planAnnotationImport', () => {
  test('creates the items in bundle order, linked by their place in the plan', () => {
    const note = annotation(first, 10, 0, { subtype: 'text', popup: refOf(first, 11) });
    const popup = annotation(first, 11, 1, { subtype: 'popup', parent: refOf(first, 10) });
    const reply = annotation(first, 12, 2, {
      subtype: 'text',
      reply: { to: refOf(first, 10), type: 'reply' },
    });
    const square = annotation(second, 20, 0);
    const { creates, dropped } = plan(bundleOf(note, popup, reply, square));

    expect(dropped).toEqual([]);
    expect(creates.map((create) => [create.item, create.page])).toEqual([
      [0, first],
      [1, first],
      [2, first],
      [3, second],
    ]);
    expect(creates[1]!.parent).toBe(0);
    expect(creates[2]!.replyTo).toEqual({ planned: 0, type: 'reply' });
    // The links are written after every create, so the drafts carry none.
    expect(creates[1]!.draft).not.toHaveProperty('parent');
    expect(creates[2]!.draft).not.toHaveProperty('reply');
  });

  test('finds a link however the bundle names its target', () => {
    const note = annotation(first, 10, 0, { subtype: 'text', nm: 'note' });
    const byName = annotation(first, 11, 1, {
      subtype: 'text',
      reply: { to: { kind: 'nm', page: first, nm: 'note' }, type: 'group' },
    });
    const byPosition = annotation(first, 12, 2, {
      subtype: 'text',
      reply: { to: { kind: 'index', page: first, index: 0, revision: 'r' }, type: 'reply' },
    });
    const { creates } = plan(bundleOf(note, byName, byPosition));
    expect(creates.map((create) => create.replyTo?.planned)).toEqual([undefined, 0, 0]);
    expect(creates[1]!.replyTo!.type).toBe('group');
  });

  test('maps pages by position, destinations included', () => {
    const link = annotation(first, 10, 0, {
      subtype: 'link',
      target: { kind: 'goto', destination: { kind: 'fit', page: second } },
    });
    const target = [
      { page: toPageRef(50), position: 0 },
      { page: toPageRef(51), position: 4 },
    ];
    const { creates } = plan(bundleOf(link, annotation(second, 20, 0)), {
      pages: 'by-position',
      target,
    });
    expect(creates.map((create) => create.page)).toEqual([toPageRef(50), toPageRef(51)]);
    expect(creates[0]!.draft).toMatchObject({
      target: { destination: { page: toPageRef(51) } },
    });
  });

  test('maps exactly the pairs a list gives', () => {
    const to = toPageRef(50);
    const target = [{ page: to, position: 0 }];
    const { creates } = plan(bundleOf(annotation(first, 10, 0)), {
      pages: [{ from: first, to }],
      target,
    });
    expect(creates[0]!.page).toEqual(to);

    expect(() =>
      plan(bundleOf(annotation(first, 10, 0)), {
        pages: [
          { from: first, to },
          { from: first, to },
        ],
        target,
      }),
    ).toThrow(expect.objectContaining({ code: EngineErrorCode.InvalidArg }));
    expect(() =>
      plan(bundleOf(annotation(first, 10, 0)), {
        pages: [{ from: first, to: toPageRef(99) }],
        target,
      }),
    ).toThrow(expect.objectContaining({ code: EngineErrorCode.NotFound }));
  });

  test('refuses the import when a page an item is on or points at maps nowhere', () => {
    const link = annotation(first, 10, 0, {
      subtype: 'link',
      target: { kind: 'goto', destination: { kind: 'fit', page: second } },
    });
    const onlyFirst = [{ page: first, position: 0 }];
    expect(() => plan(bundleOf(link), { target: onlyFirst })).toThrow(
      expect.objectContaining({
        code: EngineErrorCode.InvalidArg,
        details: { pages: [encodePageKey(second)] },
      }),
    );
  });

  test('leaves out an unsupported kind, and what points at it', () => {
    const watermark = annotation(first, 10, 0, {
      subtype: 'unsupported',
      rawSubtypeCode: 26,
      rawSubtypeName: 'Watermark',
    });
    const reply = annotation(first, 11, 1, {
      subtype: 'text',
      reply: { to: refOf(first, 10), type: 'reply' },
    });
    const answer = annotation(first, 12, 2, {
      subtype: 'text',
      reply: { to: refOf(first, 11), type: 'reply' },
    });
    const { creates, dropped } = plan(bundleOf(answer, reply, watermark));
    expect(creates).toEqual([]);
    expect(dropped).toEqual([
      { ref: answer.ref, reason: 'parent-dropped' },
      { ref: reply.ref, reason: 'parent-dropped' },
      { ref: watermark.ref, reason: 'unsupported-kind' },
    ]);
  });

  test('leaves out what points at nothing in the bundle', () => {
    const reply = annotation(first, 11, 0, {
      subtype: 'text',
      reply: { to: refOf(first, 99), type: 'reply' },
    });
    const popup = annotation(first, 12, 1, { subtype: 'popup', parent: refOf(first, 11) });
    const { creates, dropped } = plan(bundleOf(reply, popup));
    expect(creates).toEqual([]);
    expect(dropped).toEqual([
      { ref: reply.ref, reason: 'parent-missing' },
      { ref: popup.ref, reason: 'parent-dropped' },
    ]);
  });

  test('finds a parent only on the same page', () => {
    const note = annotation(first, 10, 0, { subtype: 'text' });
    const elsewhere = annotation(second, 20, 0, {
      subtype: 'text',
      reply: { to: refOf(first, 10), type: 'reply' },
    });
    const { creates, dropped } = plan(bundleOf(note, elsewhere));
    expect(creates.map((create) => create.item)).toEqual([0]);
    expect(dropped).toEqual([{ ref: elsewhere.ref, reason: 'parent-missing' }]);
  });

  test('gives a name to the first item that carries it, if the page has it free', () => {
    const taken = annotation(first, 10, 0, { nm: 'taken' });
    const once = annotation(first, 11, 1, { nm: 'twice' });
    const twice = annotation(first, 12, 2, { nm: 'twice' });
    const elsewhere = annotation(second, 20, 0, { nm: 'twice' });
    const { creates, dropped } = plan(bundleOf(taken, once, twice, elsewhere), {
      taken: [`${encodePageKey(first)}:taken`],
    });
    expect(creates.map((create) => create.item)).toEqual([1, 3]);
    expect(dropped).toEqual([
      { ref: taken.ref, reason: 'name-conflict' },
      { ref: twice.ref, reason: 'name-conflict' },
    ]);
  });

  test('two pages mapped onto one share its names', () => {
    const one = annotation(first, 10, 0, { nm: 'same' });
    const other = annotation(second, 20, 0, { nm: 'same' });
    const to = toPageRef(50);
    const { creates, dropped } = plan(bundleOf(one, other), {
      pages: [
        { from: first, to },
        { from: second, to },
      ],
      target: [{ page: to, position: 0 }],
    });
    expect(creates.map((create) => create.item)).toEqual([0]);
    expect(dropped).toEqual([{ ref: other.ref, reason: 'name-conflict' }]);
  });

  test('imports an item without a field it can only read as a marker', () => {
    const geo = annotation(first, 10, 0, { subtype: 'line', measure: { subtype: 'GEO' } });
    const unknown = annotation(first, 11, 1, { subtype: 'line', measure: { subtype: 'unknown' } });
    const { creates, dropped } = plan(
      bundleOf(
        { ...geo, linePoints: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } } as AnnotationDTO,
        { ...unknown, linePoints: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } } as AnnotationDTO,
      ),
    );
    expect(creates).toHaveLength(2);
    expect(creates[0]!.draft).toHaveProperty('measure', null);
    expect(dropped).toEqual([
      { ref: geo.ref, field: 'measure', reason: 'geospatial' },
      { ref: unknown.ref, field: 'measure', reason: 'unknown-measure' },
    ]);
  });

  test('imports a link without an action a write cannot make', () => {
    const script = annotation(first, 10, 0, { subtype: 'link', target: { kind: 'javascript' } });
    const { creates, dropped } = plan(bundleOf(script));
    expect(creates[0]!.draft).toHaveProperty('target', null);
    expect(dropped).toEqual([{ ref: script.ref, field: 'target', reason: 'unsupported-action' }]);
  });

  test("leaves out a form field's widget, which travels with its field", () => {
    const field = annotation(first, 10, 0, {
      subtype: 'widget',
      fieldObjectNumber: 44,
      fieldFamily: 'text',
    });
    const inert = annotation(first, 11, 1, {
      subtype: 'widget',
      fieldObjectNumber: 0,
      fieldFamily: 'unknown',
    });
    const { creates, dropped } = plan(bundleOf(field, inert));
    expect(creates.map((create) => create.item)).toEqual([1]);
    expect(dropped).toEqual([{ ref: field.ref, reason: 'form-field' }]);
  });

  test('reports the actions a copy leaves out, and not the one a link target carries', () => {
    const goto = {
      incomplete: false,
      warningFlags: 0,
      warnings: [],
      root: { type: 'goto', subtype: 'GoTo', next: [], destination: { kind: 'fit', page: first } },
    };
    const target = { kind: 'goto', destination: { kind: 'fit', page: first } };
    const link = annotation(first, 10, 0, { subtype: 'link', target, actions: { activate: goto } });
    const hovering = annotation(first, 11, 1, {
      subtype: 'link',
      target,
      actions: { activate: goto, cursorEnter: goto },
    });
    const chained = annotation(first, 12, 2, {
      subtype: 'link',
      target,
      actions: { activate: { ...goto, root: { ...goto.root, next: [goto.root] } } },
    });
    const square = annotation(first, 13, 3, { actions: { activate: goto } });
    const map = annotation(first, 14, 4, {
      subtype: 'link',
      target: { kind: 'uri', uri: 'https://example.com/map' },
      actions: {
        activate: {
          ...goto,
          root: {
            type: 'uri',
            subtype: 'URI',
            next: [],
            uri: 'https://example.com/map',
            isMap: true,
          },
        },
      },
    });
    const { creates, dropped } = plan(bundleOf(link, hovering, chained, square, map));
    expect(creates).toHaveLength(5);
    expect(dropped).toEqual(
      [hovering, chained, square, map].map(({ ref }) => ({
        ref,
        field: 'actions',
        reason: 'unsupported-action',
      })),
    );
  });

  test('refuses an item whose data is not valid for its kind, naming it', () => {
    const broken = annotation(first, 10, 0, { rect: { left: 'no' } });
    expect(() => plan(bundleOf(annotation(first, 9, 0), broken))).toThrow(
      expect.objectContaining({
        code: EngineErrorCode.InvalidArg,
        details: expect.objectContaining({ item: 1 }),
      }),
    );
  });
});
