import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { FileAttachmentAnnotationDTO, TextAnnotationDTO } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import type { PageObjectNumber } from '../identity/PageObjectNumber';

/**
 * Attachment conformance suite. Fixture requirement: a document whose
 * `/EmbeddedFiles` name tree contains AT LEAST ONE embedded file.
 *
 * Both attachment surfaces are OPTIONAL on the contract (the
 * `downloadLayer?` pattern), probed independently and skipped cleanly:
 *   - `doc.attachments?` — document-level EmbeddedFiles (list/download)
 *   - `page.annotations.downloadFile?` — annotation-level file bytes
 *
 * Invariants:
 *   1. `list()` reflects the name tree: positional indices, non-empty
 *      names, and repeated calls agree (a read).
 *   2. `download(index)` round-trips the listed metadata and returns
 *      exactly `size` decoded bytes when the fixture declares one.
 *   3. Unknown indices reject with an `EngineError`.
 *   4. A created file-attachment annotation round-trips its file:
 *      metadata inline on the DTO (never bytes), bytes byte-identical
 *      through `downloadFile(ref)`.
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
    let firstPon: PageObjectNumber;

    beforeAll(async () => {
      engine = await opts.makeEngine();
      const probe = await openFixture(engine, opts);
      docSupported = probe.attachments !== undefined;
      const pages = await probe.pages.list();
      firstPon = pages.pages[0].pageObjectNumber;
      annotSupported = probe.page(firstPon).annotations.downloadFile !== undefined;
      await probe.close();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('attachments.list() reflects the /EmbeddedFiles name tree and is a stable read', async () => {
      if (!docSupported) return;
      const doc = await openFixture(engine, opts);
      try {
        const items = await doc.attachments!.list();
        expect(items.length > 0).toBe(true);
        items.forEach((item, position) => {
          expect(item.index).toBe(position);
          expect(item.key.length > 0).toBe(true);
          expect(item.name.length > 0).toBe(true);
        });
        // Keys are unique by construction — they are the durable refs.
        expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
        // A read: calling again observes the identical snapshot.
        expect(await doc.attachments!.list()).toEqual(items);
      } finally {
        await doc.close();
      }
    });

    test('attachments.download() round-trips the listed metadata and decoded size', async () => {
      if (!docSupported) return;
      const doc = await openFixture(engine, opts);
      try {
        const items = await doc.attachments!.list();
        for (const item of items) {
          const content = await doc.attachments!.download({ kind: 'key', key: item.key });
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
          doc.attachments!.download({ kind: 'key', key: 'conformance-no-such-key.bin' }),
        ).rejects.toBeInstanceOf(EngineError);
      } finally {
        await doc.close();
      }
    });

    test('create() and delete() round-trip the name tree; keys survive index shifts', async () => {
      if (!docSupported) return;
      const doc = await openFixture(engine, opts);
      if (doc.attachments!.create === undefined || doc.attachments!.delete === undefined) {
        await doc.close();
        return;
      }
      try {
        const before = await doc.attachments!.list();
        const data = new Uint8Array(512);
        for (let i = 0; i < data.length; i++) data[i] = (i * 7 + 3) & 0xff;

        // "0-…" sorts before the fixture's entries, shifting their indices —
        // the sharpest difference from append-only annotation creates.
        const { created } = await doc.attachments!.create!({
          data,
          name: '0-conformance.bin',
          mimeType: 'application/octet-stream',
          description: 'added by conformance',
        });
        expect(created.key).toBe('0-conformance.bin');
        expect(created.name).toBe('0-conformance.bin');
        expect(created.mimeType).toBe('application/octet-stream');
        expect(created.description).toBe('added by conformance');
        expect(created.size).toBe(data.length);

        const after = await doc.attachments!.list();
        expect(after.length).toBe(before.length + 1);
        // Pre-existing keys still resolve even though their indices shifted.
        for (const item of before) {
          const match = after.find((i) => i.key === item.key);
          expect(match !== undefined).toBe(true);
        }

        // Duplicate keys reject — keys are the identity.
        await expect(
          doc.attachments!.create!({ data, name: '0-conformance.bin' }),
        ).rejects.toBeInstanceOf(EngineError);

        // The created file round-trips byte-identically.
        const content = await doc.attachments!.download({ kind: 'key', key: created.key });
        expect(content.bytes.length).toBe(data.length);
        expect(content.bytes.every((byte, i) => byte === data[i])).toBe(true);

        // Delete by key; the key stops resolving and the rest are intact.
        const { deleted } = await doc.attachments!.delete!({ kind: 'key', key: created.key });
        expect(deleted).toEqual({ kind: 'key', key: created.key });
        const final = await doc.attachments!.list();
        expect(final.map((i) => i.key)).toEqual(before.map((i) => i.key));
        await expect(
          doc.attachments!.delete!({ kind: 'key', key: created.key }),
        ).rejects.toBeInstanceOf(EngineError);
      } finally {
        await doc.close();
      }
    });

    test('a created file-attachment annotation round-trips its file through downloadFile()', async () => {
      if (!annotSupported) return;
      const doc = await openFixture(engine, opts);
      try {
        const annotations = doc.page(firstPon).annotations;
        const data = new Uint8Array(2048);
        for (let i = 0; i < data.length; i++) data[i] = (i * 31 + 7) & 0xff;

        const { created } = await annotations.create({
          subtype: 'file-attachment',
          rect: { left: 40, bottom: 40, right: 60, top: 60 },
          file: {
            data,
            name: 'conformance.bin',
            mimeType: 'application/octet-stream',
            description: 'attachment conformance payload',
          },
          icon: 'paperclip',
          color: { r: 220, g: 38, b: 38 },
          contents: 'conformance attachment',
        });

        // Metadata rides the DTO; bytes never do.
        const dto = created as FileAttachmentAnnotationDTO;
        expect(dto.subtype).toBe('file-attachment');
        expect(dto.icon).toBe('paperclip');
        expect(dto.color).toEqual({ r: 220, g: 38, b: 38 });
        expect(dto.file.name).toBe('conformance.bin');
        expect(dto.file.mimeType).toBe('application/octet-stream');
        expect(dto.file.description).toBe('attachment conformance payload');
        expect(dto.file.size).toBe(data.length);

        // Bytes come back byte-identical through the explicit download.
        const content = await annotations.downloadFile!(dto.ref);
        expect(content.name).toBe('conformance.bin');
        expect(content.bytes.length).toBe(data.length);
        expect(Array.from(content.bytes.slice(0, 16))).toEqual(Array.from(data.slice(0, 16)));
        expect(content.bytes.every((byte, i) => byte === data[i])).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('a created text annotation round-trips icon, color, and contents', async () => {
      if (!annotSupported) return;
      const doc = await openFixture(engine, opts);
      try {
        const annotations = doc.page(firstPon).annotations;
        const { created } = await annotations.create({
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
        const { updated } = await annotations.update(dto.ref, {
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
