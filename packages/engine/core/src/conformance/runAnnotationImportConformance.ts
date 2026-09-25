import { creatables, PNG_1X1 } from './creatables';
import type {
  AnnotationResourceConformanceOptions,
  AnnotationResourceFixture,
} from './runAnnotationResourceConformance';
import type { ConformanceTestRunner } from './runMetadataConformance';
import { BANDS_PDF } from './stampFixtures';
import type { AnnotationDTO } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { PageHandle } from '../engine/PageHandle';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { PdfRect } from '../geometry/primitives';
import { annotationKey } from '../identity/annotationKey';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { encodePageKey, toPageRef, type PageRef } from '../identity/PageRef';
import { resourceIdOf, type AnnotationBundle } from '../transfer/AnnotationBundle';
import type { AnnotationImportResult } from '../transfer/annotationImport';

/**
 * `doc.annotations.import` on both engines, in `stamp` mode: a bundle comes
 * back as the export had it, one fact per annotation as one transaction,
 * what can't be carried left out and reported, pages mapped, and a refusal
 * before anything is written.
 */
export function runAnnotationImportConformance(
  runner: ConformanceTestRunner,
  opts: AnnotationResourceConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation import conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    /** Two fresh copies of a fixture: where a bundle comes from, and where it goes. */
    const twoCopies = async (
      fixture: AnnotationResourceFixture,
      run: (source: DocumentHandle, target: DocumentHandle, page: PageRef) => Promise<void>,
    ): Promise<void> => {
      const source = await opts.open(engine, fixture);
      const target = await opts.open(engine, fixture);
      try {
        const { pages } = await source.pages.list();
        await run(source, target, toPageRef(pages[0]!.ref.pageObjectNumber));
      } finally {
        await source.close();
        await target.close();
      }
    };

    const box = (left: number): PdfRect => ({ left, bottom: 300, right: left + 40, top: 330 });
    const create = async (
      page: PageHandle,
      draft: Parameters<PageHandle['annotations']['create']>[0],
      resources?: Parameters<PageHandle['annotations']['create']>[1],
    ) => (await page.annotations.create(draft, resources)).created as AnnotationDTO;

    test('imports every kind a create makes, as the export has it', async () => {
      await twoCopies('authoring', async (source, target, pageRef) => {
        const page = source.page(pageRef);
        for (const { data, resources } of creatables()) await create(page, data, resources);
        await create(page, { subtype: 'stamp', rect: box(20) }, { appearance: BANDS_PDF });
        await create(
          page,
          { subtype: 'stamp', rect: box(80), opacity: 0.5 },
          { appearance: BANDS_PDF },
        );
        const note = await create(page, { subtype: 'text', rect: box(140), contents: 'Check' });
        await create(page, { subtype: 'popup', rect: box(200), parent: note.ref, open: true });
        await create(page, { subtype: 'text', rect: box(140), reply: { to: note.ref } });
        await create(page, {
          subtype: 'link',
          rect: box(260),
          target: { kind: 'goto', destination: { kind: 'fit', page: pageRef } },
        });

        const bundle = await source.annotations.export();
        const result = await target.annotations.import(bundle, { attribution: 'stamp' });
        expect(result.dropped).toEqual([]);
        expect(result.created).toHaveLength(bundle.items.length);
        expect(result.refMap.map((pair) => annotationKey(pair.from))).toEqual(
          bundle.items.map((item) => annotationKey(item.data.ref)),
        );

        // Exported again, the target gives the same file, apart from the new
        // refs and the attribution the import stamped: the same data, and
        // each drawing and file under the same id.
        const again = await target.annotations.export();
        expect(comparable(again, result)).toEqual(comparable(bundle));
        expect(Object.keys(again.resources).sort()).toEqual(Object.keys(bundle.resources).sort());
        expect(result.created).toEqual(again.items.map((item) => item.data));
      });
    });

    test('emits one annotation.created per annotation, as one transaction', async () => {
      await twoCopies('authoring', async (source, target, pageRef) => {
        const page = source.page(pageRef);
        await create(page, { subtype: 'square', rect: box(20) });
        await create(page, { subtype: 'circle', rect: box(80) });
        const bundle = await source.annotations.export();

        const events: DocumentEvent[] = [];
        target.events.subscribe((event) => events.push(event));
        const result = await target.annotations.import(bundle, {
          attribution: 'stamp',
          opId: 'import-1',
        });
        const created = events.filter((event) => event.type === 'annotation.created');
        expect(created).toHaveLength(2);
        created.forEach((event, index) => {
          if (event.type !== 'annotation.created') return;
          expect(event.created).toEqual(result.created[index]);
          expect(event.page).toEqual(pageRef);
          expect(event.origin.tx).toEqual({ id: 'import-1', index, count: 2 });
        });
      });
    });

    test('leaves out a name the page has, and what points at it, then names on a repeat', async () => {
      await twoCopies('authoring', async (source, target, pageRef) => {
        const page = source.page(pageRef);
        const taken = await create(page, { subtype: 'text', rect: box(20), nm: 'taken' });
        const reply = await create(page, {
          subtype: 'text',
          rect: box(20),
          reply: { to: taken.ref },
        });
        const free = await create(page, { subtype: 'square', rect: box(80), nm: 'free' });
        const unnamed = await create(page, { subtype: 'circle', rect: box(140) });
        await create(target.page(pageRef), { subtype: 'square', rect: box(200), nm: 'taken' });
        const bundle = await source.annotations.export();

        const first = await target.annotations.import(bundle, { attribution: 'stamp' });
        expect(first.dropped).toEqual([
          { ref: taken.ref, reason: 'name-conflict' },
          { ref: reply.ref, reason: 'parent-dropped' },
        ]);
        expect(first.refMap.map((pair) => annotationKey(pair.from))).toEqual(
          [free, unnamed].map((annotation) => annotationKey(annotation.ref)),
        );
        expect(first.created.map((annotation) => annotation.nm)).toEqual(['free', null]);

        // A name is recognized again; an unnamed annotation can't be.
        const second = await target.annotations.import(bundle, { attribution: 'stamp' });
        expect(second.dropped.map((drop) => drop.reason)).toEqual([
          'name-conflict',
          'parent-dropped',
          'name-conflict',
        ]);
        expect(second.created.map((annotation) => annotation.subtype)).toEqual(['circle']);
      });
    });

    test('puts each page where the options say', async () => {
      await twoCopies('authoring', async (source, target, pageRef) => {
        await create(source.page(pageRef), { subtype: 'square', rect: box(20) });
        const bundle = await source.annotations.export();
        await target.pages.insertBlank({ size: { width: 300, height: 300 } }, 0);
        const { pages } = await target.pages.list();
        const blank = toPageRef(pages[0]!.ref.pageObjectNumber);

        const pageOf = (result: AnnotationImportResult) => result.created[0]!.ref.page;
        const same = await target.annotations.import(bundle, { attribution: 'stamp' });
        expect(pageOf(same)).toEqual(pageRef);
        const byPosition = await target.annotations.import(bundle, {
          attribution: 'stamp',
          pages: 'by-position',
        });
        expect(pageOf(byPosition)).toEqual(blank);
        const listed = await target.annotations.import(bundle, {
          attribution: 'stamp',
          pages: [{ from: pageRef, to: blank }],
        });
        expect(pageOf(listed)).toEqual(blank);
        expect((await target.annotations.listRaw(blank)).annotations).toHaveLength(2);
      });
    });

    test('refuses before writing anything: an unmapped page, a tampered or oversized resource', async () => {
      await twoCopies('authoring', async (source, target, pageRef) => {
        const page = source.page(pageRef);
        const stamp = await create(
          page,
          { subtype: 'stamp', rect: box(20) },
          { appearance: PNG_1X1 },
        );
        await source.pages.insertBlank({ size: { width: 300, height: 300 } }, 1);
        const { pages } = await source.pages.list();
        const second = toPageRef(pages[1]!.ref.pageObjectNumber);
        await create(source.page(second), { subtype: 'square', rect: box(20) });
        const bundle = await source.annotations.export();

        const events: DocumentEvent[] = [];
        target.events.subscribe((event) => events.push(event));
        const refused = (
          candidate: AnnotationBundle,
          options: Parameters<DocumentHandle['annotations']['import']>[1],
        ) => target.annotations.import(candidate, { attribution: 'stamp', ...options });

        // The second page is not in the target.
        await expect(refused(bundle, {})).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
          details: { pages: [encodePageKey(second)] },
        });

        const stampOnly = (bytes: Uint8Array, id: `sha256-${string}`): AnnotationBundle => ({
          ...bundle,
          pages: bundle.pages.slice(0, 1),
          items: [{ data: stamp, resources: { appearance: id } }],
          resources: { [id]: bytes },
        });
        const tampered = stampOnly(PNG_1X1, await resourceIdOf(BANDS_PDF));
        await expect(refused(tampered, {})).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });

        // A PNG whose header says 10 000 × 10 000: refused from the header.
        const huge = PNG_1X1.slice();
        new DataView(huge.buffer).setUint32(16, 10_000);
        new DataView(huge.buffer).setUint32(20, 10_000);
        await expect(refused(stampOnly(huge, await resourceIdOf(huge)), {})).rejects.toMatchObject({
          code: EngineErrorCode.PayloadTooLarge,
          details: { limit: 'imagePixels' },
        });

        expect((await target.annotations.listRaw(pageRef)).annotations).toEqual([]);
        expect(events).toEqual([]);
      });
    });
  });
}

/**
 * A bundle as two engines or two documents can agree on it: each ref as the
 * source had it (`result.refMap` maps the target's back), and without the
 * attribution an import stamps, the attached file's dates included.
 */
function comparable(bundle: AnnotationBundle, result?: AnnotationImportResult) {
  const back = new Map(
    (result?.refMap ?? []).map((pair) => [annotationKey(pair.to), pair.from] as const),
  );
  const source = (ref: AnnotationRef | null | undefined) =>
    ref ? (back.get(annotationKey(ref)) ?? ref) : ref;
  return bundle.items.map(({ data, resources }) => {
    const {
      author: _author,
      createdAt: _createdAt,
      modifiedAt: _modifiedAt,
      userId: _userId,
      createdBy: _createdBy,
      modifiedBy: _modifiedBy,
      ...rest
    } = data as AnnotationDTO & Record<string, unknown>;
    const fields = rest as Record<string, unknown>;
    // An attached file is dated when it is written, as the stamp dates the annotation.
    if (data.subtype === 'file-attachment' && data.file) {
      const { createdAt: _fileCreatedAt, modifiedAt: _fileModifiedAt, ...file } = data.file;
      fields.file = file;
    }
    return {
      data: {
        ...fields,
        ref: source(data.ref),
        popup: source(data.popup),
        ...(data.reply ? { reply: { ...data.reply, to: source(data.reply.to) } } : {}),
        ...(data.subtype === 'popup' ? { parent: source(data.parent) } : {}),
      },
      resources,
    };
  });
}
