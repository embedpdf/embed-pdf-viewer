import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { FileAttachmentAnnotationDTO, TextAnnotationDTO } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { toAttachmentRef } from '../dto/Attachment';
import { EngineError } from '../errors/EngineError';
import { deletedAttachmentOf } from '../mutation/AttachmentMutationResults';
import { AttachmentCreateResultSchema, AttachmentListSchema } from '../wire/schemas';
import type { PageObjectNumber } from '../identity/PageObjectNumber';
import { toPageRef } from '../identity/PageRef';

/**
 * Attachment conformance suite. Fixture requirement: a document whose
 * `/EmbeddedFiles` name tree contains at least one embedded file.
 *
 * Both attachment surfaces are optional on the contract (the
 * `downloadLayer?` pattern), probed independently and skipped cleanly:
 *   - `doc.attachments?` — document-level EmbeddedFiles (list/download)
 *   - `page.annotations.downloadResource(ref, 'file')` — annotation-level file bytes
 *
 * Invariants:
 *   1. `list()` reflects the name tree: positional indices, non-empty
 *      names, and repeated calls agree (a read).
 *   2. `download(index)` round-trips the listed metadata and returns
 *      exactly `size` decoded bytes when the fixture declares one.
 *   3. Unknown indices reject with an `EngineError`.
 *   4. A created file-attachment annotation round-trips its file:
 *      metadata inline on the DTO (never bytes), bytes byte-identical
 *      as its `file` resource.
 *   5. A created text (sticky-note) annotation round-trips icon + color.
 */
export function runAttachmentConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`attachment conformance: ${opts.label}`, () => {
    let engine: Engine;
    let docSupported = false;
    let annotSupported = false;
    let firstPageObjectNumber: PageObjectNumber;

    beforeAll(async () => {
      engine = await opts.makeEngine();
      const probe = await openFixture(engine, opts);
      docSupported = probe.attachments !== undefined;
      const pages = await probe.pages.list();
      firstPageObjectNumber = pages.pages[0].ref.pageObjectNumber;
      annotSupported =
        probe.page(toPageRef(firstPageObjectNumber)).annotations.downloadResource !== undefined;
      await probe.close();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('attachments.list() reflects the /EmbeddedFiles name tree and is a stable read', async () => {
      if (!docSupported) return;
      const doc = await openFixture(engine, opts);
      try {
        const list = await doc.attachments.list();
        expect(AttachmentListSchema.safeParse(list).success).toBe(true);
        const items = list.attachments;
        expect(items.length > 0).toBe(true);
        items.forEach((item, position) => {
          expect(item.index).toBe(position);
          expect(item.ref.key.length > 0).toBe(true);
          expect(item.name.length > 0).toBe(true);
        });
        // Keys are unique by construction — they are the durable refs.
        expect(new Set(items.map((i) => i.ref.key)).size).toBe(items.length);
        // A read: calling again observes the identical snapshot.
        expect(await doc.attachments.list()).toEqual(list);
      } finally {
        await doc.close();
      }
    });

    test('attachments.download() round-trips the listed metadata and decoded size', async () => {
      if (!docSupported) return;
      const doc = await openFixture(engine, opts);
      try {
        const { attachments } = await doc.attachments.list();
        for (const item of attachments) {
          const content = await doc.attachments.download(item.ref);
          expect(content.name).toBe(item.name);
          if (item.mimeType !== undefined) {
            expect(content.mimeType).toBe(item.mimeType);
          }
          if (item.size !== undefined) {
            expect(content.bytes.length).toBe(item.size);
          }
        }
      } finally {
        await doc.close();
      }
    });

    test('attachments.download() rejects an unknown key', async () => {
      if (!docSupported) return;
      const doc = await openFixture(engine, opts);
      try {
        await expect(
          doc.attachments.download(toAttachmentRef('conformance-no-such-key.bin')),
        ).rejects.toBeInstanceOf(EngineError);
      } finally {
        await doc.close();
      }
    });

    test('create() and delete() round-trip the name tree; keys survive index shifts', async () => {
      if (!docSupported) return;
      const doc = await openFixture(engine, opts);
      try {
        const { attachments: before } = await doc.attachments.list();
        const data = new Uint8Array(512);
        for (let i = 0; i < data.length; i++) data[i] = (i * 7 + 3) & 0xff;

        // "0-…" sorts before the fixture's entries, shifting their indices —
        // the sharpest difference from append-only annotation creates.
        const createdResult = await doc.attachments.create({
          data: data.buffer,
          name: '0-conformance.bin',
          mimeType: 'application/octet-stream',
          description: 'added by conformance',
        });
        expect(AttachmentCreateResultSchema.safeParse(createdResult).success).toBe(true);
        const created = createdResult.attachment;
        expect(created.ref).toEqual(toAttachmentRef('0-conformance.bin'));
        expect(createdResult.meta.changed).toEqual([created.ref]);
        expect(created.name).toBe('0-conformance.bin');
        expect(created.mimeType).toBe('application/octet-stream');
        expect(created.description).toBe('added by conformance');
        expect(created.size).toBe(data.length);

        const { attachments: after } = await doc.attachments.list();
        expect(after.length).toBe(before.length + 1);
        // Pre-existing keys still resolve even though their indices shifted.
        for (const item of before) {
          const match = after.find((i) => i.ref.key === item.ref.key);
          expect(match !== undefined).toBe(true);
        }

        // Duplicate keys reject — keys are the identity.
        await expect(
          doc.attachments.create({ data, name: '0-conformance.bin' }),
        ).rejects.toBeInstanceOf(EngineError);

        // The created file round-trips byte-identically.
        const content = await doc.attachments.download(created.ref);
        expect(content.bytes.length).toBe(data.length);
        expect(content.bytes.every((byte, i) => byte === data[i])).toBe(true);

        // Delete by ref; the ref stops resolving and the rest are intact.
        const removed = await doc.attachments.delete(created.ref);
        expect(Object.keys(removed)).toEqual(['meta']);
        expect(deletedAttachmentOf(removed)).toEqual(created.ref);
        const { attachments: final } = await doc.attachments.list();
        expect(final.map((i) => i.ref)).toEqual(before.map((i) => i.ref));
        await expect(doc.attachments.delete(created.ref)).rejects.toBeInstanceOf(EngineError);
      } finally {
        await doc.close();
      }
    });

    test('a created file-attachment annotation round-trips its file as its file resource', async () => {
      if (!annotSupported) return;
      const doc = await openFixture(engine, opts);
      try {
        const annotations = doc.page(toPageRef(firstPageObjectNumber)).annotations;
        const data = new Uint8Array(2048);
        for (let i = 0; i < data.length; i++) data[i] = (i * 31 + 7) & 0xff;

        const { annotation: created } = await annotations.create(
          {
            subtype: 'file-attachment',
            rect: { left: 40, bottom: 40, right: 60, top: 60 },
            file: {
              name: 'conformance.bin',
              mimeType: 'application/octet-stream',
              description: 'attachment conformance payload',
            },
            icon: 'paperclip',
            color: { r: 220, g: 38, b: 38 },
            contents: 'conformance attachment',
          },
          { file: data },
        );

        // Metadata rides the DTO; bytes never do.
        const dto = created as FileAttachmentAnnotationDTO;
        expect(dto.subtype).toBe('file-attachment');
        expect(dto.icon).toBe('paperclip');
        expect(dto.color).toEqual({ r: 220, g: 38, b: 38 });
        const file = dto.file!;
        expect(file.name).toBe('conformance.bin');
        expect(file.mimeType).toBe('application/octet-stream');
        expect(file.description).toBe('attachment conformance payload');
        expect(file.size).toBe(data.length);

        // Bytes come back byte-identical as the `file` resource.
        const bytes = await annotations.downloadResource(dto.ref, 'file');
        expect(bytes.length).toBe(data.length);
        expect(Array.from(bytes.slice(0, 16))).toEqual(Array.from(data.slice(0, 16)));
        expect(bytes.every((byte, i) => byte === data[i])).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('a created text annotation round-trips icon, color, and contents', async () => {
      if (!annotSupported) return;
      const doc = await openFixture(engine, opts);
      try {
        const annotations = doc.page(toPageRef(firstPageObjectNumber)).annotations;
        const { annotation: created } = await annotations.create({
          subtype: 'text',
          rect: { left: 100, bottom: 100, right: 120, top: 120 },
          icon: 'comment',
          color: { r: 250, g: 204, b: 21 },
          contents: 'conformance note',
        });
        const dto = created as TextAnnotationDTO;
        expect(dto.subtype).toBe('text');
        expect(dto.icon).toBe('comment');
        expect(dto.color).toEqual({ r: 250, g: 204, b: 21 });
        expect(dto.contents).toBe('conformance note');

        // Icon is patchable; the file half of an attachment is not, and
        // the same presentation-only patch path applies to notes.
        const { annotation: updated } = await annotations.update(dto.ref, {
          subtype: 'text',
          icon: 'help',
        });
        expect((updated as TextAnnotationDTO).icon).toBe('help');
      } finally {
        await doc.close();
      }
    });
  });

  async function openFixture(engine: Engine, options: ConformanceOptions): Promise<DocumentHandle> {
    if (options.openKind === 'bytes') {
      return engine.open({
        kind: 'bytes',
        id: options.fixture.id,
        bytes: await options.fixture.bytes(),
      });
    }
    return engine.open({ kind: 'id', id: options.fixture.cloudId ?? options.fixture.id });
  }
}
