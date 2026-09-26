/**
 * Weak annotations through the annotation plugin on the real engine. A
 * direct-object annotation without /NM is addressed by its position until the
 * engine names it (an edit, a reply to it). After every change the plugin's
 * records must be exactly the engine's: no duplicate under the old key, no
 * ghost of a deleted one.
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import {
  annotationKey,
  type AnnotationRef,
  type DocumentHandle,
} from '@embedpdf/engine-core/runtime';
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
  const shell = await annotationShell(doc, pages);
  const weak = shell.annotation.list().find((annotation) => annotation.ref.kind === 'index');
  if (!weak) throw new Error('the fixture has no weak annotation');
  return { doc, ...shell, weak: weak.ref };
}

/** The engine's annotation keys, read fresh. */
async function engineKeys(doc: DocumentHandle): Promise<string[]> {
  const { annotations } = await doc.annotations.list();
  return annotations.map((dto) => annotationKey(dto.ref)).sort();
}

describe('weak annotations (local engine)', () => {
  test('an edit names it, and the plugin keeps one record that the selection follows', async () => {
    const { doc, ctx, annotation, weak } = await openFixture('weak-edit');
    try {
      annotation.select(weak);
      const result = await annotation.updateSelection({ color: '#00ff00' });
      await annotation.whenSynced();

      expect(result.failed).toEqual([]);
      const keys = annotation.list().map((entry) => annotationKey(entry.ref));
      expect(keys.sort()).toEqual(await engineKeys(doc));
      expect(keys).not.toContain(annotationKey(weak));
      const [selected] = annotation.getSelection() as AnnotationRef[];
      expect(selected?.kind).toBe('nm');
      expect(annotation.get(selected!)!.props.color).toBe('#00ff00');
    } finally {
      await ctx.dispose();
    }
  });

  test('a reply to it names it, and the plugin re-reads the page', async () => {
    const { doc, ctx, annotation, weak } = await openFixture('weak-reply');
    try {
      await annotation.comments.reply(weak, 'a reply');
      await annotation.whenSynced();

      expect(
        annotation
          .list()
          .map((entry) => annotationKey(entry.ref))
          .sort(),
      ).toEqual(await engineKeys(doc));
      expect(annotation.list().some((entry) => entry.ref.kind === 'index')).toBe(false);
    } finally {
      await ctx.dispose();
    }
  });

  test('a delete leaves no ghost', async () => {
    const { doc, ctx, annotation, weak } = await openFixture('weak-delete');
    try {
      annotation.select(weak);
      const result = await annotation.deleteSelection();
      await annotation.whenSynced();

      expect(result.failed).toEqual([]);
      expect(
        annotation
          .list()
          .map((entry) => annotationKey(entry.ref))
          .sort(),
      ).toEqual(await engineKeys(doc));
      expect(annotation.list().some((entry) => entry.ref.kind === 'index')).toBe(false);
    } finally {
      await ctx.dispose();
    }
  });
});
