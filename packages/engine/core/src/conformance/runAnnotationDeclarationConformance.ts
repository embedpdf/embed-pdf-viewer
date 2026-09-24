import { annotationReadDriftOf } from './annotationReadDrift';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { AnnotationDraft } from '../annotation/kinds';
import type { AnnotationResources } from '../annotation/resources';
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
          const snapshot = await doc.annotations.listRawAll();
          for (const page of snapshot.pages) reads.push(...page.annotations);
        } finally {
          await doc.close();
        }
      }

      const doc = await openFixture(engine, opts, opts.authoring);
      try {
        const first = (await doc.annotations.listRawAll()).pages[0];
        expect(first !== undefined).toBe(true);
        const page = first!.pageState.page;
        for (const { data, resources } of creatables()) {
          const { created } = await doc.page(page).annotations.create(data, resources);
          reads.push(created);
        }
        reads.push(...(await doc.annotations.listRaw(page)).annotations);
      } finally {
        await doc.close();
      }

      expect(annotationReadDriftOf(reads)).toEqual([]);
    });

    /** Open the authoring document and hand its first page to `run`. */
    const onAuthoringPage = async (run: (page: PageHandle) => Promise<void>): Promise<void> => {
      const doc = await openFixture(engine, opts, opts.authoring);
      try {
        const first = (await doc.annotations.listRawAll()).pages[0]!;
        await run(doc.page(first.pageState.page));
      } finally {
        await doc.close();
      }
    };

    test('shared fields follow the write rules on every kind', async () => {
      await onAuthoringPage(async (page) => {
        for (const { data, resources } of creatables()) {
          const { created } = await page.annotations.create(data, resources);
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
          const { created } = await page.annotations.create(data, resources);
          const result = await page.annotations.update(created.ref, created as never);
          expect(result.appearance.changed).toBe(false);
          const { modified: _before, ...expected } = created;
          const { modified: _after, ...updated } = result.updated;
          expect(updated).toEqual(expected);
        }
      });
    });

    test('an update takes its subtype from the annotation it targets', async () => {
      await onAuthoringPage(async (page) => {
        const { created } = await page.annotations.create(creatables()[0]!.data);
        const result = await page.annotations.update(created.ref, { contents: 'No subtype' });
        expect(result.updated.contents).toBe('No subtype');
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
        const { created } = await page.annotations.create({ ...square, nm: 'declared-square' });
        await expect(
          page.annotations.update(created.ref, { quadPoints: [] } as never),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        const same = await page.annotations.update(created.ref, { nm: 'declared-square' });
        expect(same.updated.nm).toBe('declared-square');
        await expect(
          page.annotations.update(created.ref, { nm: 'renamed-square' }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      });
    });

    test('a popup links to its parent in both directions', async () => {
      await onAuthoringPage(async (page) => {
        const rect: PdfRect = { left: 200, bottom: 200, right: 260, top: 240 };
        const note = (await page.annotations.create({ subtype: 'text', rect })).created;
        const popup = (await page.annotations.create({ subtype: 'popup', rect, parent: note.ref }))
          .created;
        const find = async (ref: AnnotationRef) =>
          (await page.annotations.list()).annotations.find(
            (annotation) => annotationKey(annotation.ref) === annotationKey(ref),
          )!;
        expect(popup.subtype === 'popup' && popup.parent !== null).toBe(true);
        expect(annotationKey((await find(note.ref)).popup!)).toBe(annotationKey(popup.ref));
        const unlinked = await page.annotations.update(popup.ref, { parent: null });
        expect(unlinked.updated.subtype === 'popup' && unlinked.updated.parent).toBe(null);
        expect((await find(note.ref)).popup).toBe(null);
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
        const { created } = await page.annotations.create(
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
        const { created } = await page.annotations.create(
          { subtype: 'stamp', rect, name: 'Approved' },
          { appearance: PNG_1X1 },
        );
        const result = await page.annotations.update(created.ref, {}, { appearance: PNG_1X1 });
        expect(result.appearance.changed).toBe(true);
        const { modified: _before, ...expected } = created;
        const { modified: _after, ...updated } = result.updated;
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
        expect(fitOf(plain.created)).toBe('contain');
        const { created } = await page.annotations.create(
          { subtype: 'stamp', rect, fit: 'cover' },
          { appearance: PNG_1X1 },
        );
        expect(fitOf(created)).toBe('cover');
        const moved = await page.annotations.update(created.ref, {
          rect: { ...rect, right: rect.right + 40 },
        });
        expect(fitOf(moved.updated)).toBe('cover');
        const refit = await page.annotations.update(created.ref, { fit: 'fill' });
        expect(fitOf(refit.updated)).toBe('fill');
        expect(refit.appearance.changed).toBe(true);
        const forgotten = await page.annotations.update(created.ref, { fit: null });
        expect(fitOf(forgotten.updated)).toBe(null);
      });
    });

    test('an attached file is renamed by its data and replaced by its resource', async () => {
      await onAuthoringPage(async (page) => {
        const attachment = creatables().find(({ data }) => data.subtype === 'file-attachment')!;
        const { created } = await page.annotations.create(attachment.data, attachment.resources);
        const fileOf = (dto: { subtype: string }) =>
          (dto as { file?: { name: string; size?: number; checksum?: string } | null }).file;
        const original = fileOf(created)!;

        // The value replaces all of the metadata: leaving the description out removes it.
        const renamed = await page.annotations.update(created.ref, {
          file: { ...original, name: 'renamed.txt', description: null },
        });
        expect(renamed.appearance.changed).toBe(false);
        expect(fileOf(renamed.updated)).toEqual({
          name: 'renamed.txt',
          mimeType: 'text/plain',
          size: original.size,
          checksum: original.checksum,
          creationDate: (original as { creationDate?: string }).creationDate,
        });

        const bytes = new TextEncoder().encode('replaced bytes');
        const replaced = await page.annotations.update(created.ref, {}, { file: bytes });
        expect(fileOf(replaced.updated)).toMatchObject({
          name: 'renamed.txt',
          mimeType: 'text/plain',
          size: bytes.byteLength,
        });
        if (page.annotations.downloadFile) {
          const content = await page.annotations.downloadFile(created.ref);
          expect(new TextDecoder().decode(content.bytes)).toBe('replaced bytes');
          expect(content.name).toBe('renamed.txt');
        }
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

/** A 1×1 PNG, the smallest source a stamp accepts. */
const PNG_1X1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (character) => character.charCodeAt(0),
);

/** A create's two arguments. */
interface Creatable {
  data: AnnotationDraft;
  resources?: AnnotationResources;
}

/** One create for every kind the engine can create, inside a box near the page origin. */
function creatables(): Creatable[] {
  const rect: PdfRect = { left: 40, bottom: 40, right: 140, top: 100 };
  const quad = {
    p1: { x: 40, y: 100 },
    p2: { x: 140, y: 100 },
    p3: { x: 40, y: 80 },
    p4: { x: 140, y: 80 },
  };
  const vertices = [
    { x: 50, y: 50 },
    { x: 130, y: 50 },
    { x: 90, y: 90 },
  ];
  const drafts: AnnotationDraft[] = [
    { subtype: 'highlight', quadPoints: [quad] },
    { subtype: 'underline', quadPoints: [quad] },
    { subtype: 'squiggly', quadPoints: [quad] },
    { subtype: 'strikeout', quadPoints: [quad] },
    { subtype: 'square', rect },
    // Rotation and a shape caption live in /EMBD_Metadata, which a plain annotation lacks.
    {
      subtype: 'square',
      rect,
      rotation: 30,
      unrotatedRect: { left: 60, bottom: 50, right: 120, top: 90 },
    },
    { subtype: 'circle', rect },
    { subtype: 'polygon', rect, vertices },
    { subtype: 'polygon', rect, vertices, captionEnabled: true, captionCenter: { x: 90, y: 60 } },
    { subtype: 'polyline', rect, vertices },
    { subtype: 'line', rect, linePoints: { start: { x: 50, y: 50 }, end: { x: 130, y: 90 } } },
    { subtype: 'ink', rect, inkList: [vertices] },
    {
      subtype: 'free-text',
      rect,
      intent: 'free-text',
      fontFamily: 'helvetica',
      fontSize: 12,
      textAlign: 'left',
      contents: 'Declaration conformance',
    },
    { subtype: 'caret', rect },
    { subtype: 'text', rect },
    { subtype: 'link', rect, target: { kind: 'uri', uri: 'https://example.com' } },
    { subtype: 'redact', rect, quadPoints: [quad] },
  ];
  return [
    ...drafts.map((data) => ({ data })),
    { data: { subtype: 'stamp', rect }, resources: { appearance: PNG_1X1 } },
    {
      data: {
        subtype: 'file-attachment',
        rect,
        file: { name: 'note.txt', mimeType: 'text/plain', description: 'A note' },
      },
      resources: { file: new TextEncoder().encode('attached') },
    },
  ];
}
