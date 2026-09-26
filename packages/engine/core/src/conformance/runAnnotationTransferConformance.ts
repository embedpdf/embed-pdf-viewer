import { appearanceRasters, maxShiftedDifference } from './appearanceRasters';
import { creatables } from './creatables';
import type { ConformanceTestRunner } from './runMetadataConformance';
import { BANDS_PDF, sameBytes } from './stampFixtures';
import type { AnnotationDTO } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { PageHandle } from '../engine/PageHandle';
import type { PdfRect } from '../geometry/primitives';
import { annotationKey, annotationKeysOf } from '../identity/annotationKey';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { encodePageKey, toPageRef, type PageRef } from '../identity/PageRef';
import type { AnnotationBundle } from '../transfer/AnnotationBundle';
import type { AnnotationImportDrop, AnnotationImportResult } from '../transfer/annotationImport';
import { pageRefsIn } from '../transfer/pageRefs';

export interface AnnotationTransferConformanceOptions {
  label: string;
  /** Build a fresh engine for this suite. The suite tears it down at the end. */
  makeEngine: () => Promise<Engine> | Engine;
  /**
   * The documents to round-trip. `'authoring'` is a document without
   * annotations, which the suite fills with one annotation of every kind a
   * create makes, two stamps sharing a drawing, a named comment with its
   * popup and a reply, and a link.
   */
  fixtures: readonly string[];
  /** Open a fresh copy of a fixture, with every scope, `doc.annotate.import` included. */
  open: (engine: Engine, fixture: string) => Promise<DocumentHandle>;
  /** Whether the engine renders raw appearance rasters (local) or only encoded images (cloud). */
  rawAppearances: boolean;
}

type Attribution = 'restore' | 'stamp';

/** The attribution `stamp` writes afresh, and so leaves out of a comparison. */
const STAMPED = ['author', 'createdAt', 'modifiedAt', 'userId', 'createdBy', 'modifiedBy'];

/**
 * The round-trip contract (transfer plan §4) over every fixture, on both
 * engines. `B` is the export of a document, `D2` a copy of it without its
 * annotations, and `B2` the export of `D2` after importing `B`:
 *
 * - R1: `N(B2)` equals `N(B')`, `B'` being `B` as the import took it, and
 *   every resource is the same bytes under the same id. A copy is drawn from
 *   its data, as Acrobat's FDF and XFDF carry it: only a stamp carries its
 *   drawing. So where the data is points, the box is the frame of our
 *   drawing, which holds the points, and an icon's box is our icon at the
 *   same anchor;
 * - R2: restored attribution is the source's (in `N`), stamped attribution
 *   the session's;
 * - R3: every page keeps `B`'s order (the item order in `N`);
 * - R4: replies, popups, their parents and link destinations point at the
 *   copies (refs become positions in `N`);
 * - R5: a stamp draws as its source, and in our own file every kind does,
 *   an edge moved by a fraction of a pixel aside (Acrobat moves a stamp's
 *   form by a fraction of a point, which the drawing leaves out);
 * - R7: a second import names nothing twice;
 * - R8: it adds no drawing `D2` already has.
 *
 * R6 is the export suite's golden files, and R9 the engines' forced-failure
 * tests.
 */
export function runAnnotationTransferConformance(
  runner: ConformanceTestRunner,
  opts: AnnotationTransferConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation transfer conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    /** The source document `D`, and its export `B`. */
    const exported = async (fixture: string) => {
      const doc = await opts.open(engine, fixture);
      if (fixture === 'authoring') await fill(doc);
      return { doc, bundle: await doc.annotations.export() };
    };

    /**
     * `D2`: a fresh copy of the fixture, its annotations deleted, apart from
     * form fields' widgets, which belong to their fields. The keys of those it
     * kept are returned, so an export of `D2` can leave them out.
     */
    const bare = async (fixture: string) => {
      const doc = await opts.open(engine, fixture);
      const kept = new Set<string>();
      const pages = (await doc.pages.list()).pages.map((entry) =>
        toPageRef(entry.ref.pageObjectNumber),
      );
      const session = await doc.annotations.beginEdit(pages);
      try {
        for (const pageRef of pages) {
          for (;;) {
            const { annotations } = await doc.annotations.list({ pages: [pageRef] });
            const last = [...annotations]
              .reverse()
              .find((annotation) => !isFieldWidget(annotation));
            if (!last) break;
            await doc.page(pageRef).annotations.delete(last.ref);
          }
          const { annotations } = await doc.annotations.list({ pages: [pageRef] });
          for (const annotation of annotations) kept.add(annotationKey(annotation.ref));
        }
      } finally {
        await session.close();
      }
      return { doc, kept };
    };

    const roundTrip = async (
      fixture: string,
      attribution: Attribution,
      check: (run: {
        source: DocumentHandle;
        bundle: AnnotationBundle;
        copy: DocumentHandle;
        result: AnnotationImportResult;
        again: AnnotationBundle;
        /** The widgets `D2` kept: an export of `D2` leaves them out. */
        kept: ReadonlySet<string>;
      }) => Promise<void>,
    ) => {
      const { doc: source, bundle } = await exported(fixture);
      const { doc: copy, kept } = await bare(fixture);
      try {
        const result = await copy.annotations.import(bundle, { attribution });
        const again = without(await copy.annotations.export(), kept);
        await check({ source, bundle, copy, result, again, kept });
      } finally {
        await source.close();
        await copy.close();
      }
    };

    /** The frame of each copy whose data is points holds those points. */
    const expectFramesHoldGeometry = (bundle: AnnotationBundle) => {
      const epsilon = 0.01;
      for (const { data } of bundle.items) {
        if (!FRAMED.has(data.subtype)) continue;
        const { rect } = data;
        const outside = geometryOf(data).filter(
          ({ x, y }) =>
            x < rect.left - epsilon ||
            x > rect.right + epsilon ||
            y < rect.bottom - epsilon ||
            y > rect.top + epsilon,
        );
        expect({ key: annotationKey(data.ref), outside }).toEqual({
          key: annotationKey(data.ref),
          outside: [],
        });
      }
    };

    const expectSameResources = (actual: AnnotationBundle, expected: AnnotationBundle) => {
      expect(Object.keys(actual.resources).sort()).toEqual(Object.keys(expected.resources).sort());
      for (const [id, bytes] of Object.entries(expected.resources)) {
        expect(sameBytes(actual.resources[id as keyof typeof actual.resources]!, bytes)).toBe(true);
      }
    };

    for (const fixture of opts.fixtures) {
      describe(fixture, () => {
        test('R1–R4: a restoring import exports as its source, as far as the import took it', async () => {
          await roundTrip(fixture, 'restore', async ({ bundle, result, again }) => {
            const taken = asTaken(bundle, result.dropped);
            expect(normalized(again, 'restore')).toEqual(normalized(taken, 'restore'));
            expectFramesHoldGeometry(again);
            expectSameResources(again, taken);
          });
        });

        test('R1–R2: a stamping import does too, apart from the attribution it stamps', async () => {
          await roundTrip(fixture, 'stamp', async ({ bundle, result, again }) => {
            const taken = asTaken(bundle, result.dropped);
            expect(normalized(again, 'stamp')).toEqual(normalized(taken, 'stamp'));
            expectFramesHoldGeometry(again);
            expectSameResources(again, taken);
          });
        });

        test('R5: a stamp draws as its source, and in our own file every kind does', async () => {
          await roundTrip(fixture, 'restore', async ({ source, bundle, copy, result }) => {
            const copyOf = new Map(
              result.refMap.map(({ from, to }) => [annotationKey(from), to] as const),
            );
            for (const entry of bundle.pages) {
              const drawn = await appearanceRasters(source.page(entry.page), opts.rawAppearances);
              const copies = await appearanceRasters(copy.page(entry.page), opts.rawAppearances);
              for (const { data } of bundle.items) {
                if (data.ref.page.pageObjectNumber !== entry.page.pageObjectNumber) continue;
                if (fixture !== 'authoring' && data.subtype !== 'stamp') continue;
                const to = copyOf.get(annotationKey(data.ref));
                const original = drawn.get(annotationKey(data.ref));
                if (!to || !original) continue;
                const copied = copies.get(annotationKey(to));
                // The key rides along, so a failure names the annotation.
                const key = annotationKey(data.ref);
                expect({
                  key,
                  size: copied && [copied.width, copied.height],
                  same: !!copied && maxShiftedDifference(copied, original) <= 3,
                }).toEqual({ key, size: [original.width, original.height], same: true });
              }
            }
          });
        });

        test('R7–R8: a second import names nothing twice and adds no drawing', async () => {
          await roundTrip(fixture, 'restore', async ({ bundle, copy, result, again, kept }) => {
            const taken = asTaken(bundle, result.dropped);
            const second = await copy.annotations.import(bundle);
            const conflicts = new Set(
              second.dropped
                .filter((drop) => drop.reason === 'name-conflict')
                .map((drop) => annotationKey(drop.ref)),
            );
            for (const { data } of taken.items) {
              if (data.nm) expect(conflicts.has(annotationKey(data.ref))).toBe(true);
            }
            expect(second.annotations.every((created) => created.nm === null)).toBe(true);
            const third = without(await copy.annotations.export(), kept);
            expect(Object.keys(third.resources).sort()).toEqual(
              Object.keys(again.resources).sort(),
            );
          });
        });
      });
    }
  });
}

/** Kinds whose data is points: the box is the frame of what is drawn. */
const FRAMED: ReadonlySet<string> = new Set([
  'line',
  'polyline',
  'polygon',
  'ink',
  'highlight',
  'underline',
  'squiggly',
  'strikeout',
]);

/** Kinds drawn as a fixed-size icon at their box's bottom-left. */
const ICONS: ReadonlySet<string> = new Set(['text', 'file-attachment']);

/** The points an annotation's data places on the page: its line, vertices, strokes or quads. */
function geometryOf(data: AnnotationDTO): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== 'object' || value === null) return;
    const { x, y } = value as { x?: unknown; y?: unknown };
    if (typeof x === 'number' && typeof y === 'number') points.push({ x, y });
    else Object.values(value).forEach(visit);
  };
  const fields = data as unknown as Record<string, unknown>;
  for (const name of ['linePoints', 'vertices', 'inkList', 'quadPoints']) visit(fields[name]);
  return points;
}

/** A form field's widget: it stays with its field. */
function isFieldWidget(annotation: AnnotationDTO): boolean {
  return annotation.subtype === 'widget' && annotation.fieldObjectNumber > 0;
}

/** A bundle without the items `keys` name, and without what only they named. */
function without(bundle: AnnotationBundle, keys: ReadonlySet<string>): AnnotationBundle {
  const items = bundle.items.filter(({ data }) => !keys.has(annotationKey(data.ref)));
  return pruned({ ...bundle, items });
}

/** A bundle without the resources and pages no item names. */
function pruned(bundle: AnnotationBundle): AnnotationBundle {
  const named = new Set(bundle.items.flatMap((item) => Object.values(item.resources)));
  const onPages = new Set(
    bundle.items.flatMap(({ data }) => [data.ref.page, ...pageRefsIn(data)].map(encodePageKey)),
  );
  return {
    ...bundle,
    pages: bundle.pages.filter((entry) => onPages.has(encodePageKey(entry.page))),
    resources: Object.fromEntries(
      Object.entries(bundle.resources).filter(([id]) => named.has(id as `sha256-${string}`)),
    ) as AnnotationBundle['resources'],
  };
}

/**
 * `B'`: the bundle as the import took it (transfer plan §4). The items left
 * out go, a field left out reads `null`, and the resources and pages no item
 * still names go too.
 */
function asTaken(bundle: AnnotationBundle, dropped: readonly AnnotationImportDrop[]) {
  const left = new Set(
    dropped.filter((drop) => !drop.field).map((drop) => annotationKey(drop.ref)),
  );
  const fields = new Map<string, string[]>();
  for (const { ref, field } of dropped) {
    if (field) fields.set(annotationKey(ref), [...(fields.get(annotationKey(ref)) ?? []), field]);
  }
  const items = bundle.items
    .filter(({ data }) => !left.has(annotationKey(data.ref)))
    .map((item) => {
      const cleared = fields.get(annotationKey(item.data.ref));
      if (!cleared) return item;
      const data = { ...item.data } as Record<string, unknown>;
      for (const field of cleared) data[field] = null;
      return { ...item, data: data as unknown as AnnotationDTO };
    });
  return pruned({ ...bundle, items });
}

/**
 * `N(bundle)`: what two documents can agree on (transfer plan §4). Refs to
 * annotations become positions in the bundle, pages their position in the
 * source document; `index`, `importedBy`, `identityQuality` (how the
 * source stored it) and a file's size and checksum (the bytes', which are
 * compared by their id) go, and in `stamp` mode the attribution it stamps.
 * A link's `activate` action is its `target`, compared there: a `/Dest`
 * and the `/A` a copy writes for it read the same target.
 */
function normalized(bundle: AnnotationBundle, attribution: Attribution) {
  const position = new Map<string, number>();
  bundle.items.forEach(({ data }, at) => {
    for (const key of annotationKeysOf(data)) if (!position.has(key)) position.set(key, at);
  });
  const at = (ref: AnnotationRef | null | undefined) =>
    ref ? (position.get(annotationKey(ref)) ?? null) : null;
  const pagePosition = new Map(
    bundle.pages.map((entry) => [encodePageKey(entry.page), entry.position]),
  );
  const pages = (value: unknown): unknown => {
    if (typeof value !== 'object' || value === null) return value;
    if (Array.isArray(value)) return value.map(pages);
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).length === 2 &&
      record.kind === 'objectNumber' &&
      'pageObjectNumber' in record
    ) {
      return { position: pagePosition.get(encodePageKey(record as unknown as PageRef)) };
    }
    return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, pages(child)]));
  };
  return {
    pages: bundle.pages.map(({ position, box }) => ({ position, box })),
    items: bundle.items.map(({ data, resources }) => {
      const {
        ref,
        index: _index,
        importedBy: _importedBy,
        identityQuality: _identityQuality,
        popup,
        reply,
        ...rest
      } = data;
      const fields: Record<string, unknown> = {
        ...rest,
        ref: at(ref),
        popup: at(popup),
        reply: reply ? { ...reply, to: at(reply.to) } : reply,
      };
      if (data.subtype === 'popup') fields.parent = at(data.parent);
      // A copy is drawn from its data (§4): where the data is points, the
      // box is the frame of what we draw, checked to contain the points
      // (`expectFramesHoldGeometry`); a note's or a file's icon is 20 × 20 at
      // its box's bottom-left, so the anchor is compared.
      if (ICONS.has(data.subtype)) {
        fields.rect = { left: data.rect.left, bottom: data.rect.bottom };
      }
      if (FRAMED.has(data.subtype)) delete fields.rect;
      if (data.subtype === 'link' && data.actions) {
        const { activate: _activate, ...triggers } = data.actions;
        fields.actions = Object.keys(triggers).length > 0 ? triggers : null;
      }
      if (attribution === 'stamp') for (const field of STAMPED) delete fields[field];
      if (data.subtype === 'file-attachment' && data.file) {
        // A file's dates are facts about the file: they travel in either mode.
        const { size: _size, checksum: _checksum, ...file } = data.file;
        fields.file = file;
      }
      return { data: pages(fields), resources };
    }),
  };
}

/** Fill our own file: every kind a create makes, stamps sharing a drawing, a thread, a link. */
async function fill(doc: DocumentHandle): Promise<void> {
  const { pages } = await doc.pages.list();
  const pageRef = toPageRef(pages[0]!.ref.pageObjectNumber);
  const page = doc.page(pageRef);
  const create = async (
    draft: Parameters<PageHandle['annotations']['create']>[0],
    resources?: Parameters<PageHandle['annotations']['create']>[1],
  ) => (await page.annotations.create(draft, resources)).annotation as AnnotationDTO;
  for (const { data, resources } of creatables()) await create(data, resources);
  const box = (left: number): PdfRect => ({ left, bottom: 300, right: left + 40, top: 330 });
  await create({ subtype: 'stamp', rect: box(20), nm: 'approved' }, { appearance: BANDS_PDF });
  await create({ subtype: 'stamp', rect: box(80), opacity: 0.5 }, { appearance: BANDS_PDF });
  const note = await create({ subtype: 'text', rect: box(140), nm: 'note', contents: 'Check' });
  await create({ subtype: 'popup', rect: box(200), parent: note.ref, open: true });
  await create({ subtype: 'text', rect: box(140), reply: { to: note.ref } });
  await create({
    subtype: 'link',
    rect: box(260),
    target: { kind: 'goto', destination: { kind: 'fit', page: pageRef } },
  });
}
