import { iconRect } from './creatables';
import type {
  AnnotationResourceConformanceOptions,
  AnnotationResourceFixture,
} from './runAnnotationResourceConformance';
import type { ConformanceTestRunner } from './runMetadataConformance';
import { BANDS_PDF, BANDS_PNG, sameBytes } from './stampFixtures';
import type { AnnotationDTO } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { PageHandle } from '../engine/PageHandle';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PageBox } from '../geometry/pageSpace';
import { annotationKey } from '../identity/annotationKey';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { toPageRef, type PageRef } from '../identity/PageRef';
import { assertAnnotationBundle, type AnnotationBundle } from '../transfer/AnnotationBundle';
import { AnnotationTransfer } from '../transfer/AnnotationTransfer';

/**
 * `doc.annotations.export` on both engines: the annotations as a raw read
 * returns them, each resource once under its hash, the same bytes
 * `downloadResource` returns, and a selection with what it points at and, by
 * default, its threads.
 */
export function runAnnotationExportConformance(
  runner: ConformanceTestRunner,
  opts: AnnotationResourceConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation export conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const onPage = async (
      fixture: AnnotationResourceFixture,
      run: (page: PageHandle, doc: DocumentHandle, pageRef: PageRef) => Promise<void>,
    ): Promise<void> => {
      const doc = await opts.open(engine, fixture);
      try {
        const { pages } = await doc.pages.list();
        const pageRef = toPageRef(pages[0]!.ref.pageObjectNumber);
        await run(doc.page(pageRef), doc, pageRef);
      } finally {
        await doc.close();
      }
    };

    const keysOf = (bundle: AnnotationBundle) =>
      bundle.items.map((item) => annotationKey(item.data.ref));

    test('exports the annotations as a read returns them, and each resource once', async () => {
      await onPage('authoring', async (page, doc, pageRef) => {
        const box = (x: number): PageBox => ({ x, y: 20, width: 60, height: 30 });
        const first = await page.annotations.create(
          { subtype: 'stamp', box: box(20) },
          { appearance: BANDS_PDF },
        );
        const second = await page.annotations.create(
          { subtype: 'stamp', box: box(100), opacity: 0.5 },
          { appearance: BANDS_PDF },
        );
        const image = await page.annotations.create(
          { subtype: 'stamp', box: box(180) },
          { appearance: BANDS_PNG },
        );
        const file = await page.annotations.create(
          {
            subtype: 'file-attachment',
            rect: iconRect(box(260).x, box(260).y),
            file: { name: 'note.txt' },
          },
          { file: new TextEncoder().encode('attached') },
        );

        const bundle = await doc.annotations.export();
        await assertAnnotationBundle(bundle);
        const read = await doc.annotations.list({ pages: [pageRef] });
        expect(bundle.items.map((item) => item.data)).toEqual(read.annotations);

        const { pages } = await doc.pages.list();
        expect(bundle.pages).toEqual([{ page: pageRef, position: 0, size: pages[0]!.size }]);

        const idOf = (ref: AnnotationRef, role: 'appearance' | 'file') =>
          bundle.items.find((item) => annotationKey(item.data.ref) === annotationKey(ref))!
            .resources[role]!;
        // One drawing, one resource, however many stamps place it.
        expect(idOf(first.annotation.ref, 'appearance')).toBe(
          idOf(second.annotation.ref, 'appearance'),
        );
        expect(Object.keys(bundle.resources)).toHaveLength(3);
        for (const [ref, role] of [
          [first.annotation.ref, 'appearance'],
          [image.annotation.ref, 'appearance'],
          [file.annotation.ref, 'file'],
        ] as const) {
          const bytes = await page.annotations.downloadResource(ref, role);
          expect(sameBytes(bundle.resources[idOf(ref, role)]!, bytes)).toBe(true);
        }

        expect(await AnnotationTransfer.parse(AnnotationTransfer.stringify(bundle))).toEqual(
          bundle,
        );
      });
    });

    test('exports a stamp another tool made as downloadResource returns it', async () => {
      await onPage('acrobat-stamps', async (page, doc) => {
        const bundle = await doc.annotations.export();
        await assertAnnotationBundle(bundle);
        const stamps = bundle.items.filter((item) => item.data.subtype === 'stamp');
        expect(stamps).toHaveLength(2);
        for (const stamp of stamps) {
          const bytes = await page.annotations.downloadResource(stamp.data.ref, 'appearance');
          expect(sameBytes(bundle.resources[stamp.resources.appearance!]!, bytes)).toBe(true);
        }
      });
    });

    // Every engine exports these fixtures to exactly this file, so a bundle
    // is the same whichever engine made it. A change to what a read returns,
    // or to the canonical drawing, changes these on purpose: update them here.
    test('exports a document to the same file on every engine', async () => {
      const expected = {
        'acrobat-stamps': 'df9a5ec066203aa4dae25cc22e5cfb00f97bf6852ab330a8e4e8de1e45de13e1',
        'acrobat-rewrapped': '729b682bcd5c2d70b0f896dbda4897c3c80ae556e310a244b30f33d772c0a194',
      } as const;
      for (const [fixture, hash] of Object.entries(expected)) {
        await onPage(fixture as AnnotationResourceFixture, async (_page, doc) => {
          const text = AnnotationTransfer.stringify(await doc.annotations.export());
          const digest = new Uint8Array(
            await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
          );
          let hex = '';
          for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
          expect(hex).toBe(hash);
        });
      }
    });

    test('takes a comment with its thread, or only what it points at', async () => {
      await onPage('authoring', async (page, doc) => {
        const rect: PageBox = { x: 300, y: 300, width: 20, height: 20 };
        const create = async (draft: Parameters<PageHandle['annotations']['create']>[0]) =>
          (await page.annotations.create(draft)).annotation as AnnotationDTO;
        const note = await create({
          subtype: 'text',
          rect: iconRect(rect.x, rect.y),
          contents: 'Check this',
        });
        const popup = await create({ subtype: 'popup', rect, parent: note.ref });
        const reply = await create({
          subtype: 'text',
          rect: iconRect(rect.x, rect.y),
          reply: { to: note.ref },
        });
        const answer = await create({
          subtype: 'text',
          rect: iconRect(rect.x, rect.y),
          reply: { to: reply.ref },
        });
        await create({ subtype: 'square', box: rect });

        const keys = (refs: AnnotationDTO[]) =>
          refs.map((annotation) => annotationKey(annotation.ref));
        expect(keysOf(await doc.annotations.export({ refs: [note.ref] }))).toEqual(
          keys([note, popup, reply, answer]),
        );
        expect(
          keysOf(await doc.annotations.export({ refs: [note.ref], include: 'references' })),
        ).toEqual(keys([note, popup]));
        expect(
          keysOf(await doc.annotations.export({ refs: [answer.ref], include: 'references' })),
        ).toEqual(keys([note, popup, reply, answer]));
      });
    });

    test('exports the document as it is now, after an edit and after a page move', async () => {
      await onPage('authoring', async (page, doc, first) => {
        const rect: PageBox = { x: 20, y: 20, width: 60, height: 30 };
        await page.annotations.create({ subtype: 'square', box: rect });
        const before = await doc.annotations.export();
        expect(before.items).toHaveLength(1);

        // A new annotation is in the next export.
        await page.annotations.create({ subtype: 'circle', box: rect });
        expect((await doc.annotations.export()).items).toHaveLength(2);

        // A page move changes where the pages are, and nothing about the
        // annotations: the export gives the new position.
        await doc.pages.insertBlank({ size: { width: 200, height: 200 } }, 0);
        expect((await doc.annotations.export()).pages.map((entry) => entry.position)).toEqual([1]);
        await doc.pages.move([first], 0);
        const moved = await doc.annotations.export();
        expect(moved.pages).toEqual([{ ...before.pages[0]!, position: 0 }]);
      });
    });

    test('takes a selection larger than a URL holds', async () => {
      await onPage('authoring', async (page, doc) => {
        // Long names push the selection past what an export URL carries.
        const created: AnnotationDTO[] = [];
        for (let i = 0; i < 24; i++) {
          const { annotation } = await page.annotations.create({
            subtype: 'square',
            box: { x: 10 + i, y: 10, width: 30, height: 30 },
            nm: `export-conformance-long-selection-${String(i).padStart(3, '0')}-${'x'.repeat(200)}`,
          });
          created.push(annotation);
        }
        const refs = created.map((annotation) => ({
          kind: 'nm' as const,
          page: annotation.ref.page,
          nm: annotation.nm!,
        }));
        const bundle = await doc.annotations.export({ refs });
        expect(bundle.items.map((item) => item.data.nm).sort()).toEqual(
          created.map((annotation) => annotation.nm).sort(),
        );
      });
    });

    test('refuses a page or an annotation the document does not have', async () => {
      await onPage('authoring', async (_page, doc, pageRef) => {
        const missing = { code: EngineErrorCode.NotFound };
        await expect(doc.annotations.export({ pages: [toPageRef(999_999)] })).rejects.toMatchObject(
          missing,
        );
        await expect(
          doc.annotations.export({
            refs: [{ kind: 'objectNumber', page: pageRef, annotObjectNumber: 999_999 }],
          }),
        ).rejects.toMatchObject(missing);
      });
    });
  });
}
