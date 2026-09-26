import { annotationReadDriftOf } from './annotationReadDrift';
import { creatables, PNG_1X1 } from './creatables';
import type { ConformanceTestRunner } from './runMetadataConformance';
import { TWO_PAGE_PDF } from './stampFixtures';
import type { AnnotationDTO } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { PageHandle } from '../engine/PageHandle';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { annotationKey } from '../identity/annotationKey';
import type { Engine } from '../engine/Engine';
import type { PdfRect } from '../geometry/primitives';

export interface AnnotationDeclarationFixture {
  /** Stable id used for the local engine; cloud uses its own id. */
  id: string;
  /** Bytes for the local engine. */
  bytes: () => Uint8Array | Promise<Uint8Array>;
  /** Override the cloud-side id. Defaults to `id`. */
  cloudId?: string;
}

export interface AnnotationDeclarationConformanceOptions {
  label: string;
  /** Build a fresh engine for this suite. The suite tears it down at the end. */
  makeEngine: () => Promise<Engine> | Engine;
  /** Engine 'kind' for opening: 'bytes' for local, 'id' for cloud. */
  openKind: 'bytes' | 'id';
  /**
   * A document without weak annotations. One annotation of every kind the
   * engine can create is added to its first page, then read back.
   */
  authoring: AnnotationDeclarationFixture;
  /** Documents whose annotations are read as they are. */
  documents: readonly AnnotationDeclarationFixture[];
  /** A document with a link whose target a write can't make (a script, a viewer command). */
  readOnlyLink: AnnotationDeclarationFixture;
}

/**
 * Every annotation both engines read, from real documents and freshly created
 * ones, is checked against its kind declaration.
 */
export function runAnnotationDeclarationConformance(
  runner: ConformanceTestRunner,
  opts: AnnotationDeclarationConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation declaration conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('every read matches its kind declaration', async () => {
      const reads: unknown[] = [];
      for (const fixture of opts.documents) {
        const doc = await openFixture(engine, opts, fixture);
        try {
          reads.push(...(await doc.annotations.list()).annotations);
        } finally {
          await doc.close();
        }
      }

      const doc = await openFixture(engine, opts, opts.authoring);
      try {
        const first = (await doc.annotations.list()).pages[0];
        expect(first !== undefined).toBe(true);
        const page = first!.page;
        for (const { data, resources } of creatables()) {
          const { annotation: created } = await doc.page(page).annotations.create(data, resources);
          reads.push(created);
        }
        reads.push(...(await doc.annotations.list({ pages: [page] })).annotations);
      } finally {
        await doc.close();
      }

      expect(annotationReadDriftOf(reads)).toEqual([]);
    });

    /** Open the authoring document and hand its first page to `run`. */
    const onAuthoringPage = async (
      run: (page: PageHandle, doc: DocumentHandle) => Promise<void>,
    ): Promise<void> => {
      const doc = await openFixture(engine, opts, opts.authoring);
      try {
        const first = (await doc.annotations.list()).pages[0]!;
        await run(doc.page(first.page), doc);
      } finally {
        await doc.close();
      }
    };

    test('shared fields follow the write rules on every kind', async () => {
      await onAuthoringPage(async (page) => {
        for (const { data, resources } of creatables()) {
          const { annotation: created } = await page.annotations.create(data, resources);
          const read = async () =>
            (await page.annotations.list()).annotations.find(
              (annotation) => annotationKey(annotation.ref) === annotationKey(created.ref),
            ) as unknown as Record<string, unknown>;
          const text: [string, string, string][] = [['subject', 'Pricing', 'Terms']];
          // A free text box and a redaction paint their contents, so clearing them is not tested here.
          if (data.subtype !== 'free-text' && data.subtype !== 'redact') {
            text.push(['contents', 'First note', 'Second note']);
          }
          for (const [field, first, second] of text) {
            await page.annotations.update(created.ref, { [field]: first });
            expect((await read())[field]).toBe(first);
            await page.annotations.update(created.ref, {});
            expect((await read())[field]).toBe(first);
            await page.annotations.update(created.ref, { [field]: second });
            expect((await read())[field]).toBe(second);
            await page.annotations.update(created.ref, { [field]: null });
            expect((await read())[field]).toBe(null);
          }
          // Each flag is its own field: setting one leaves the others as they are.
          await page.annotations.update(created.ref, { hidden: true });
          await page.annotations.update(created.ref, { print: true });
          expect(await read()).toMatchObject({ hidden: true, print: true, locked: false });
          await page.annotations.update(created.ref, { hidden: false });
          expect(await read()).toMatchObject({ hidden: false, print: true });
        }
      });
    });

    test('a read sent back as an update changes nothing', async () => {
      await onAuthoringPage(async (page) => {
        for (const { data, resources } of creatables()) {
          const { annotation: created } = await page.annotations.create(data, resources);
          const result = await page.annotations.update(created.ref, created as never);
          expect(result.appearance.changed).toBe(false);
          const { modifiedAt: _before, ...expected } = created;
          const { modifiedAt: _after, ...updated } = result.annotation;
          expect(updated).toEqual(expected);
        }
      });
    });

    test('an update takes its subtype from the annotation it targets', async () => {
      await onAuthoringPage(async (page) => {
        const { annotation: created } = await page.annotations.create(creatables()[0]!.data);
        const result = await page.annotations.update(created.ref, { contents: 'No subtype' });
        expect(result.annotation.contents).toBe('No subtype');
        await expect(
          page.annotations.update(created.ref, { subtype: 'square', contents: 'x' } as never),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      });
    });

    test('a field the kind does not declare is refused, and so is a new name', async () => {
      await onAuthoringPage(async (page) => {
        const square = creatables().find(({ data }) => data.subtype === 'square')!.data;
        await expect(
          page.annotations.create({ ...square, colour: { r: 0, g: 0, b: 0 } } as never),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        const { annotation: created } = await page.annotations.create({
          ...square,
          nm: 'declared-square',
        });
        await expect(
          page.annotations.update(created.ref, { quadPoints: [] } as never),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        const same = await page.annotations.update(created.ref, { nm: 'declared-square' });
        expect(same.annotation.nm).toBe('declared-square');
        await expect(
          page.annotations.update(created.ref, { nm: 'renamed-square' }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      });
    });

    test('a popup links to its parent in both directions', async () => {
      await onAuthoringPage(async (page) => {
        const rect: PdfRect = { left: 200, bottom: 200, right: 260, top: 240 };
        const note = (await page.annotations.create({ subtype: 'text', rect })).annotation;
        const popup = (await page.annotations.create({ subtype: 'popup', rect, parent: note.ref }))
          .annotation;
        const find = async (ref: AnnotationRef) =>
          (await page.annotations.list()).annotations.find(
            (annotation) => annotationKey(annotation.ref) === annotationKey(ref),
          )!;
        expect(popup.subtype === 'popup' && popup.parent !== null).toBe(true);
        expect(annotationKey((await find(note.ref)).popup!)).toBe(annotationKey(popup.ref));
        // A popup shows an annotation: it can't be created or left without one.
        await expect(
          page.annotations.create({ subtype: 'popup', rect } as never),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg, details: { field: 'parent' } });
        await expect(
          page.annotations.update(popup.ref, { parent: null } as never),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        // Deleting it on its own leaves the note, which stops naming it.
        await page.annotations.delete(popup.ref);
        expect((await find(note.ref)).popup).toBe(null);
      });
    });

    test("a popup's open state is read and written", async () => {
      await onAuthoringPage(async (page) => {
        const rect: PdfRect = { left: 200, bottom: 260, right: 260, top: 300 };
        const note = (await page.annotations.create({ subtype: 'text', rect })).annotation;
        // A PDF that says nothing about /Open shows the window closed.
        const closed = (await page.annotations.create({ subtype: 'popup', rect, parent: note.ref }))
          .annotation;
        expect(closed.subtype === 'popup' && closed.open).toBe(false);
        const opened = await page.annotations.update(closed.ref, { open: true });
        expect(opened.annotation.subtype === 'popup' && opened.annotation.open).toBe(true);
        const created = (
          await page.annotations.create({ subtype: 'popup', rect, parent: note.ref, open: true })
        ).annotation;
        expect(created.subtype === 'popup' && created.open).toBe(true);
      });
    });

    test('values are checked, not only names, with the field named', async () => {
      await onAuthoringPage(async (page) => {
        const rect: PdfRect = { left: 300, bottom: 520, right: 360, top: 560 };
        const refused = (field: string) => ({
          code: EngineErrorCode.InvalidArg,
          details: { field },
        });
        await expect(
          page.annotations.create({ subtype: 'square', rect, color: { r: 300, g: 0, b: 0 } }),
        ).rejects.toMatchObject(refused('color.r'));
        await expect(
          page.annotations.create({ subtype: 'square', rect, opacity: 1.5 }),
        ).rejects.toMatchObject(refused('opacity'));
        await expect(
          page.annotations.create({ subtype: 'square', rect, cloudyIntensity: 0 }),
        ).rejects.toMatchObject(refused('cloudyIntensity'));
        await expect(
          page.annotations.create({ subtype: 'text', rect, icon: 'dragon' } as never),
        ).rejects.toMatchObject(refused('icon'));
        await expect(
          page.annotations.create({
            subtype: 'free-text',
            rect,
            contents: 'x',
            intent: 'free-text',
            fontSize: 12,
            textAlign: 'left',
          } as never),
        ).rejects.toMatchObject(refused('fontFamily'));
        await expect(
          page.annotations.create({
            subtype: 'link',
            rect,
            target: { kind: 'javascript' },
          } as never),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        await expect(
          page.annotations.create(
            { subtype: 'file-attachment', rect, file: { name: '' } },
            { file: new Uint8Array([1]) },
          ),
        ).rejects.toMatchObject(refused('file.name'));
        const { annotation } = await page.annotations.create({ subtype: 'square', rect });
        await expect(
          page.annotations.update(annotation.ref, { opacity: -1 }),
        ).rejects.toMatchObject(refused('opacity'));
        // A refused value changes nothing.
        const after = (await page.annotations.list()).annotations.find(
          (read) => annotationKey(read.ref) === annotationKey(annotation.ref),
        );
        expect(after?.subtype === 'square' && after.opacity).toBe(1);
      });
    });

    test('opacity reads back as written', async () => {
      await onAuthoringPage(async (page) => {
        const rect: PdfRect = { left: 300, bottom: 580, right: 360, top: 620 };
        const { annotation } = await page.annotations.create({
          subtype: 'square',
          rect,
          opacity: 0.5,
        });
        expect(annotation.subtype === 'square' && annotation.opacity).toBe(0.5);
        // Not only values a float holds exactly.
        const { annotation: updated } = await page.annotations.update(annotation.ref, {
          opacity: 0.3,
        });
        expect(updated.subtype === 'square' && updated.opacity).toBe(0.3);
        const { annotation: stamp } = await page.annotations.create(
          { subtype: 'stamp', rect, opacity: 0.75 },
          { appearance: PNG_1X1 },
        );
        expect(stamp.subtype === 'stamp' && stamp.opacity).toBe(0.75);
      });
    });

    test('a new quad list replaces the old one, shorter or longer', async () => {
      await onAuthoringPage(async (page) => {
        const quad = (bottom: number) => ({
          p1: { x: 40, y: bottom + 10 },
          p2: { x: 140, y: bottom + 10 },
          p3: { x: 40, y: bottom },
          p4: { x: 140, y: bottom },
        });
        for (const subtype of ['highlight', 'redact'] as const) {
          const { annotation } = await page.annotations.create({
            subtype,
            quadPoints: [quad(600), quad(620)],
          } as never);
          const { annotation: fewer } = await page.annotations.update(annotation.ref, {
            quadPoints: [quad(640)],
          });
          const quads = (fewer as { quadPoints: unknown[] }).quadPoints;
          expect(quads.length).toBe(1);
          expect(fewer.rect).toMatchObject({ bottom: 640, top: 650 });
        }
        const { annotation } = await page.annotations.create({
          subtype: 'highlight',
          quadPoints: [quad(600)],
        });
        await expect(
          page.annotations.update(annotation.ref, { quadPoints: [] }),
        ).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
          details: { field: 'quadPoints' },
        });
      });
    });

    test("a redaction's box comes from its quads, and a mark needs one or the other", async () => {
      await onAuthoringPage(async (page) => {
        const { annotation } = await page.annotations.create({
          subtype: 'redact',
          quadPoints: [
            {
              p1: { x: 50, y: 520 },
              p2: { x: 150, y: 520 },
              p3: { x: 50, y: 500 },
              p4: { x: 150, y: 500 },
            },
          ],
        });
        expect(annotation.rect).toMatchObject({ left: 50, bottom: 500, right: 150, top: 520 });
        await expect(page.annotations.create({ subtype: 'redact' } as never)).rejects.toMatchObject(
          {
            code: EngineErrorCode.InvalidArg,
            details: { field: 'rect' },
          },
        );
      });
    });

    test('a review state brings its model; a custom state needs one', async () => {
      await onAuthoringPage(async (page) => {
        const rect: PdfRect = { left: 420, bottom: 520, right: 440, top: 540 };
        const { annotation } = await page.annotations.create({
          subtype: 'text',
          rect,
          state: 'accepted',
        });
        expect(annotation.subtype === 'text' && annotation.stateModel).toBe('review');
        const { annotation: marked } = await page.annotations.update(annotation.ref, {
          state: 'marked',
        });
        expect(marked.subtype === 'text' && marked.stateModel).toBe('marked');
        await expect(
          page.annotations.create({ subtype: 'text', rect, state: 'escalated' }),
        ).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
          details: { field: 'stateModel' },
        });
        const { annotation: custom } = await page.annotations.create({
          subtype: 'text',
          rect,
          state: 'escalated',
          stateModel: 'triage',
        });
        const { annotation: moved } = await page.annotations.update(custom.ref, {
          state: 'closed',
        });
        expect(moved.subtype === 'text' && moved.stateModel).toBe('triage');
      });
    });

    test('a line without a caption flag reads captionEnabled: null', async () => {
      await onAuthoringPage(async (page) => {
        const { annotation } = await page.annotations.create({
          subtype: 'line',
          rect: { left: 40, bottom: 470, right: 140, top: 490 },
          linePoints: { start: { x: 40, y: 480 }, end: { x: 140, y: 480 } },
        } as never);
        expect(annotation.subtype === 'line' && annotation.captionEnabled).toBe(null);
        const { annotation: flagged } = await page.annotations.update(annotation.ref, {
          captionEnabled: true,
        });
        expect(flagged.subtype === 'line' && flagged.captionEnabled).toBe(true);
        const { annotation: cleared } = await page.annotations.update(annotation.ref, {
          captionEnabled: null,
        });
        expect(cleared.subtype === 'line' && cleared.captionEnabled).toBe(null);
      });
    });

    test('a stamp takes a one-page PDF', async () => {
      await onAuthoringPage(async (page) => {
        const rect: PdfRect = { left: 420, bottom: 460, right: 480, top: 500 };
        await expect(
          page.annotations.create({ subtype: 'stamp', rect }, { appearance: TWO_PAGE_PDF }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      });
    });

    test('a weak annotation exports by its position ref', async () => {
      for (const fixture of opts.documents) {
        const doc = await openFixture(engine, opts, fixture);
        try {
          const weak = (await doc.annotations.list()).annotations.find(
            (annotation) => annotation.ref.kind === 'index',
          );
          if (!weak) continue;
          const bundle = await doc.annotations.export({ refs: [weak.ref] });
          expect(bundle.items.map((item) => item.data.subtype)).toEqual([weak.subtype]);
          return;
        } finally {
          await doc.close();
        }
      }
      throw new Error('no fixture document has a weak annotation');
    });

    test('a link read back can be sent back; its read-only target is kept', async () => {
      const doc = await openFixture(engine, opts, opts.readOnlyLink);
      try {
        const link = (await doc.annotations.list()).annotations.find(
          (annotation) =>
            annotation.subtype === 'link' &&
            annotation.target !== null &&
            annotation.target.kind !== 'goto' &&
            annotation.target.kind !== 'uri',
        ) as Extract<AnnotationDTO, { subtype: 'link' }> | undefined;
        expect(link !== undefined).toBe(true);
        const page = doc.page(link!.ref.page);
        const sentBack = await page.annotations.update(link!.ref, {
          ...link!,
          contents: 'Sent back',
        } as never);
        expect(sentBack.annotation.subtype === 'link' && sentBack.annotation.target).toEqual(
          link!.target,
        );
        await expect(
          page.annotations.update(link!.ref, { target: { kind: 'named', name: 'PrevPage' } }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg, details: { field: 'target' } });
      } finally {
        await doc.close();
      }
    });

    test('deleting a note deletes its thread and popups, in one change', async () => {
      await onAuthoringPage(async (page, doc) => {
        const rect: PdfRect = { left: 460, bottom: 300, right: 480, top: 320 };
        const find = async (ref: AnnotationRef) =>
          (await page.annotations.list()).annotations.find(
            (annotation) => annotationKey(annotation.ref) === annotationKey(ref),
          );
        const create = async (data: object) =>
          (await page.annotations.create(data as never)).annotation;
        const note = await create({ subtype: 'text', rect, contents: 'Note' });
        const notePopup = await create({ subtype: 'popup', rect, parent: note.ref });
        const reply = await create({
          subtype: 'text',
          rect,
          contents: 'Reply',
          reply: { to: note.ref },
        });
        const replyPopup = await create({ subtype: 'popup', rect, parent: reply.ref });
        const nested = await create({
          subtype: 'text',
          rect,
          contents: 'Nested',
          reply: { to: reply.ref },
        });
        const status = await create({
          subtype: 'text',
          rect,
          state: 'accepted',
          reply: { to: note.ref },
        });
        const bystander = await create({ subtype: 'text', rect, contents: 'Unrelated' });

        // A reply takes the replies under it, and its popup; the note stays.
        const replyDelete = await page.annotations.delete(reply.ref);
        expect(replyDelete.meta.changed.length).toBe(3);
        expect(await find(reply.ref)).toBe(undefined);
        expect(await find(nested.ref)).toBe(undefined);
        expect(await find(replyPopup.ref)).toBe(undefined);
        expect((await find(note.ref)) !== undefined).toBe(true);

        const deleted: unknown[][] = [];
        const stop = doc.events.on('annotations.deleted', (event) => {
          deleted.push(event.deleted);
        });
        try {
          const { meta } = await page.annotations.delete(note.ref);
          expect(meta.changed.length).toBe(3);
          expect(meta.changed[0]).toMatchObject({ kind: 'objectNumber' });
          expect(deleted).toEqual([meta.changed]);
        } finally {
          stop();
        }
        for (const gone of [note, notePopup, status]) expect(await find(gone.ref)).toBe(undefined);
        expect((await find(bystander.ref)) !== undefined).toBe(true);
      });
    });

    test('a resource belongs to the kinds that take it', async () => {
      await onAuthoringPage(async (page) => {
        const rect: PdfRect = { left: 300, bottom: 300, right: 360, top: 340 };
        const refused = { code: EngineErrorCode.InvalidArg };
        await expect(page.annotations.create({ subtype: 'stamp', rect })).rejects.toMatchObject(
          refused,
        );
        await expect(
          page.annotations.create({ subtype: 'file-attachment', rect, file: { name: 'a.txt' } }),
        ).rejects.toMatchObject(refused);
        await expect(
          page.annotations.create({ subtype: 'square', rect }, { appearance: PNG_1X1 }),
        ).rejects.toMatchObject(refused);
        await expect(
          page.annotations.create(
            { subtype: 'stamp', rect },
            { appearance: new TextEncoder().encode('not an image') },
          ),
        ).rejects.toMatchObject(refused);
        const { annotation: created } = await page.annotations.create(
          { subtype: 'stamp', rect },
          { appearance: PNG_1X1 },
        );
        await expect(
          page.annotations.update(created.ref, {}, { file: new Uint8Array([1]) }),
        ).rejects.toMatchObject(refused);
      });
    });

    test("a new appearance replaces a stamp's drawing and keeps its data", async () => {
      await onAuthoringPage(async (page) => {
        const rect: PdfRect = { left: 300, bottom: 400, right: 360, top: 440 };
        const { annotation: created } = await page.annotations.create(
          { subtype: 'stamp', rect, name: 'Approved' },
          { appearance: PNG_1X1 },
        );
        const result = await page.annotations.update(created.ref, {}, { appearance: PNG_1X1 });
        expect(result.appearance.changed).toBe(true);
        const { modifiedAt: _before, ...expected } = created;
        const { modifiedAt: _after, ...updated } = result.annotation;
        expect(updated).toEqual(expected);
      });
    });

    test("a stamp's fit is recorded, and a new box is filled the same way", async () => {
      await onAuthoringPage(async (page) => {
        const rect: PdfRect = { left: 300, bottom: 460, right: 360, top: 500 };
        const fitOf = (dto: { subtype: string }) => (dto as { fit?: unknown }).fit;
        const plain = await page.annotations.create(
          { subtype: 'stamp', rect },
          { appearance: PNG_1X1 },
        );
        expect(fitOf(plain.annotation)).toBe('contain');
        const { annotation: created } = await page.annotations.create(
          { subtype: 'stamp', rect, fit: 'cover' },
          { appearance: PNG_1X1 },
        );
        expect(fitOf(created)).toBe('cover');
        const moved = await page.annotations.update(created.ref, {
          rect: { ...rect, right: rect.right + 40 },
        });
        expect(fitOf(moved.annotation)).toBe('cover');
        const refit = await page.annotations.update(created.ref, { fit: 'fill' });
        expect(fitOf(refit.annotation)).toBe('fill');
        expect(refit.appearance.changed).toBe(true);
        const forgotten = await page.annotations.update(created.ref, { fit: null });
        expect(fitOf(forgotten.annotation)).toBe(null);
      });
    });

    test('an attached file is renamed by its data and replaced by its resource', async () => {
      await onAuthoringPage(async (page) => {
        const attachment = creatables().find(({ data }) => data.subtype === 'file-attachment')!;
        const { annotation: created } = await page.annotations.create(
          attachment.data,
          attachment.resources,
        );
        const fileOf = (dto: { subtype: string }) =>
          (dto as { file?: { name: string; size?: number; checksum?: string } | null }).file;
        const original = fileOf(created)!;

        // The value replaces all of the metadata: leaving the description out removes it.
        const renamed = await page.annotations.update(created.ref, {
          file: { ...original, name: 'renamed.txt', description: null },
        });
        expect(renamed.appearance.changed).toBe(false);
        expect(fileOf(renamed.annotation)).toEqual({
          name: 'renamed.txt',
          mimeType: 'text/plain',
          description: null,
          size: original.size,
          checksum: original.checksum,
          createdAt: (original as { createdAt?: string }).createdAt,
          modifiedAt: (original as { modifiedAt?: string }).modifiedAt,
        });

        const bytes = new TextEncoder().encode('replaced bytes');
        const replaced = await page.annotations.update(created.ref, {}, { file: bytes });
        expect(fileOf(replaced.annotation)).toMatchObject({
          name: 'renamed.txt',
          mimeType: 'text/plain',
          size: bytes.byteLength,
        });
        const read = await page.annotations.downloadResource(created.ref, 'file');
        expect(new TextDecoder().decode(read)).toBe('replaced bytes');
      });
    });
  });
}

async function openFixture(
  engine: Engine,
  opts: AnnotationDeclarationConformanceOptions,
  fixture: AnnotationDeclarationFixture,
): Promise<DocumentHandle> {
  if (opts.openKind === 'bytes') {
    return engine.open({ kind: 'bytes', id: fixture.id, bytes: await fixture.bytes() });
  }
  return engine.open({ kind: 'id', id: fixture.cloudId ?? fixture.id });
}
