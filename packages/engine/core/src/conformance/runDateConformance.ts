import type { ConformanceTestRunner } from './runMetadataConformance';
import type { AnnotationDTO } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { toPageRef } from '../identity/PageRef';

export interface DateConformanceOptions {
  label: string;
  /** Build a fresh engine for this suite. The suite tears it down at the end. */
  makeEngine: () => Promise<Engine> | Engine;
  /**
   * Open a fresh copy of `dates.pdf` (`packages/engine/main/test/fixtures`):
   * one page (object 3) whose squares carry known `/CreationDate` and `/M`
   * values, a file attachment annotation and an embedded file whose
   * `/Params` carry dates, and an Info dictionary with dates.
   */
  open: (engine: Engine) => Promise<DocumentHandle>;
}

/**
 * Dates on both engines: a PDF date reads as ISO 8601 with the offset it was
 * written with, a read written back is the same moment in the same zone, a
 * write takes the string or a `Date`, and a date that isn't one reads `null`.
 */
export function runDateConformance(
  runner: ConformanceTestRunner,
  opts: DateConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`date conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const withDocument = async (run: (doc: DocumentHandle) => Promise<void>) => {
      const doc = await opts.open(engine);
      try {
        await run(doc);
      } finally {
        await doc.close();
      }
    };

    const annotationsOf = async (doc: DocumentHandle) => {
      const { annotations } = await doc.page(toPageRef(3)).annotations.list();
      const byName = (nm: string): AnnotationDTO => {
        const found = annotations.find((annotation) => annotation.nm === nm);
        if (!found) throw new Error(`no annotation named ${nm}`);
        return found;
      };
      return byName;
    };

    test('an annotation reads its dates with the offset they were written with', async () => {
      await withDocument(async (doc) => {
        const byName = await annotationsOf(doc);
        expect(byName('dates-offset')).toMatchObject({
          createdAt: '2017-07-12T21:44:38-07:00',
          modifiedAt: '2017-07-13T09:15:00+05:30',
        });
        // No offset in the PDF, so none in the read; `Z` stays UTC.
        expect(byName('dates-local')).toMatchObject({
          createdAt: '2017-07-12T21:44:38',
          modifiedAt: '2017-07-12T21:44:38Z',
        });
        // Text that isn't a date reads null; a date with only a year takes the spec's defaults.
        expect(byName('dates-odd')).toMatchObject({
          createdAt: null,
          modifiedAt: '2017-01-01T00:00:00',
        });
      });
    });

    test('a read goes back into an update through JSON, and keeps its creation date', async () => {
      await withDocument(async (doc) => {
        const page = doc.page(toPageRef(3));
        const read = (await annotationsOf(doc))('dates-offset');
        const before = Date.now();
        const { annotation: updated } = await page.annotations.update(
          read.ref,
          JSON.parse(JSON.stringify(read)),
        );
        expect(updated.createdAt).toBe('2017-07-12T21:44:38-07:00');
        // The engine stamps the update itself, in UTC.
        expect(updated.modifiedAt).toMatch(/Z$/);
        expect(Date.parse(updated.modifiedAt!) >= Math.floor(before / 1000) * 1000).toBe(true);
      });
    });

    test('document metadata keeps offsets, and a write takes the string or a Date', async () => {
      await withDocument(async (doc) => {
        const read = await doc.metadata.get();
        expect(read.createdAt).toBe('2017-07-12T21:44:38-07:00');
        expect(read.modifiedAt).toBe('2019-02-03T04:05:06+09:00');

        await doc.metadata.update({ createdAt: '2020-01-02T03:04:05+05:30' });
        expect((await doc.metadata.get()).createdAt).toBe('2020-01-02T03:04:05+05:30');

        // A `Date` is an instant: written in UTC, whole seconds.
        await doc.metadata.update({ modifiedAt: new Date('2021-06-07T10:09:10.500+02:00') });
        expect((await doc.metadata.get()).modifiedAt).toBe('2021-06-07T08:09:10Z');

        // A read sent back through JSON writes the same dates.
        const current = await doc.metadata.get();
        const { createdAt, modifiedAt } = JSON.parse(JSON.stringify(current)) as typeof current;
        await doc.metadata.update({ createdAt, modifiedAt });
        expect(await doc.metadata.get()).toMatchObject({ createdAt, modifiedAt });

        await doc.metadata.update({ createdAt: null });
        expect((await doc.metadata.get()).createdAt).toBe(null);
      });
    });

    test('an attached file reads the dates of its /Params', async () => {
      await withDocument(async (doc) => {
        const file = (await annotationsOf(doc))('dates-file') as AnnotationDTO & {
          file: { createdAt?: string; modifiedAt?: string } | null;
        };
        expect(file.file).toMatchObject({
          createdAt: '2017-07-12T21:44:38-07:00',
          modifiedAt: '2018-01-01T12:00:00+01:00',
        });
        const [embedded] = (await doc.attachments.list()).attachments;
        expect(embedded).toMatchObject({
          name: 'a.txt',
          createdAt: '2017-07-12T21:44:38-07:00',
          modifiedAt: '2018-01-01T12:00:00+01:00',
        });
      });
    });
  });
}
