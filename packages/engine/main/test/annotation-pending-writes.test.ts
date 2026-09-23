/**
 * Changes made faster than the engine answers, through the annotation plugin
 * on the real engine: an edit of a new annotation before its create is
 * confirmed, and two edits of a weak annotation where the first makes the
 * engine name it. The engine must end with every change, and the plugin's
 * records must be the engine's.
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { annotationKey, type DocumentHandle } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';
import { annotationShell } from './helpers/annotation-shell';

const FIXTURE = new URL(
  '../../../../examples/engine-runtime-demo/public/annotations.pdf',
  import.meta.url,
);

async function openFixture(id: string) {
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  const bytes = new Uint8Array(await readFile(FIXTURE));
  const doc = await engine.open(
    { kind: 'layerBytes', id, baseBytes: bytes, layer: { kind: 'fresh' } },
    { scope: ['*'] },
  );
  const pages = (await doc.pages.list()).pages;
  return { doc, pages, ...(await annotationShell(doc, pages)) };
}

async function engineKeys(doc: DocumentHandle): Promise<string[]> {
  const snapshot = await doc.annotations.listRawAll();
  return snapshot.pages
    .flatMap((page) => page.annotations)
    .map((dto) => annotationKey(dto.ref))
    .sort();
}

describe('changes faster than the engine answers (local engine)', () => {
  test('an edit of a new annotation before its create is confirmed is written after it', async () => {
    const { doc, pages, ctx, annotation } = await openFixture('pending-create-edit');
    try {
      const created = annotation.create({
        subtype: 'square',
        page: pages[0]!.ref,
        bounds: { x: 20, y: 20, width: 60, height: 40 },
        select: true,
      });
      // The create is in flight: the new annotation is selected under its new: id.
      const restyled = annotation.updateSelection({ color: '#00ff00' });
      const ref = await created;
      await restyled;
      await annotation.whenSynced();

      expect(annotation.getSelection()).toEqual([ref]);
      expect(annotation.get(ref)!.props.color).toBe('#00ff00');
      const raw = (await doc.page(ref.page).annotations.list()).annotations.find(
        (dto) => annotationKey(dto.ref) === annotationKey(ref),
      );
      expect(raw && 'color' in raw ? raw.color : null).toEqual({ r: 0, g: 255, b: 0 });
      expect(
        annotation
          .list()
          .map((entry) => annotationKey(entry.ref))
          .sort(),
      ).toEqual(await engineKeys(doc));
    } finally {
      await ctx.dispose();
    }
  });

  test('two edits of a weak annotation: the first names it, both land on one record', async () => {
    const { doc, ctx, annotation } = await openFixture('pending-weak-edits');
    try {
      const weak = annotation.list().find((entry) => entry.ref.kind === 'index')!.ref;
      annotation.select(weak);
      const green = annotation.updateSelection({ color: '#00ff00' });
      const faded = annotation.updateSelection({ opacity: 0.2 });
      await Promise.all([green, faded]);
      await annotation.whenSynced();

      const keys = annotation
        .list()
        .map((entry) => annotationKey(entry.ref))
        .sort();
      expect(keys).toEqual(await engineKeys(doc));
      const [selected] = annotation.getSelection();
      expect(selected?.kind).toBe('nm');
      // The engine stores opacity in 1/255 steps.
      const { props } = annotation.get(selected!)!;
      expect(props.color).toBe('#00ff00');
      expect(props.opacity).toBeCloseTo(0.2, 2);
      const raw = annotation.getRaw(selected!);
      expect(raw && 'opacity' in raw ? raw.opacity : null).toBeCloseTo(0.2, 2);
    } finally {
      await ctx.dispose();
    }
  });
});
