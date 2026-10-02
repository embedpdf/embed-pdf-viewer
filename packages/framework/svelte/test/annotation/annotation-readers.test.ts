import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushSync } from 'svelte';
import { waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Kernel } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
// `whenSynced()` is a host call: the test waits for the first load with it.
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { interactionPlugin } from '../../src/interaction';
import {
  annotationKey,
  annotationPlugin,
  useAnnotationDefaults,
  useAnnotationList,
  useAnnotationProperties,
  useCommentThread,
  useCommentThreads,
  useFilePickerProvider,
  type Annotation,
  type AnnotationRef,
} from '../../src/annotation';
import { resetDevWarnings } from '../../src/runtime/dev';
import Probes from '../fixtures/Probes.svelte';
import { signal } from '../fixtures/signal.svelte';
import Toggled from '../fixtures/Toggled.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * The annotation readers over a real kernel and engine: the lists, a tool's defaults, the style
 * panel's properties and the comment threads follow the plugin, empty before a document opens;
 * `useFilePickerProvider()` installs one provider per document and says so when two components
 * both install one.
 */

const here = dirname(fileURLToPath(import.meta.url));
const packages = resolve(here, '..', '..', '..', '..');
const fixturePath = resolve(
  packages,
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'annotations.pdf',
);
const wasmPath = resolve(packages, 'engine', 'runtime', 'npm', 'wasm32', 'lib', 'embedpdf.wasm');

type Probe = { read: () => unknown; pick: (result: unknown) => unknown; seen: unknown[] };

const probe = <R>(read: () => R, pick: (result: R) => unknown): Probe => ({
  read,
  pick: pick as (result: unknown) => unknown,
  seen: [],
});

async function engine() {
  const wasmBinary = new Uint8Array(await readFile(wasmPath));
  return createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });
}

async function openNotes(kernel: Kernel) {
  const bytes = new Uint8Array(await readFile(fixturePath));
  await kernel.documents.open({ kind: 'bytes', id: 'notes', bytes });
  await waitFor(() => expect(kernel.tryCapability(AnnotationHostToken, undefined)).not.toBeNull(), {
    timeout: 20_000,
  });
  const annotation = kernel.capability(AnnotationHostToken);
  await annotation.whenSynced();
  flushSync();
  return annotation;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the annotation readers', () => {
  it('lists, defaults and properties follow the plugin, and read empty before a document', async () => {
    const local = await engine();
    const all = probe(
      () => useAnnotationList(),
      (list) => list.current.length,
    );
    const squares = probe(
      () => useAnnotationList({ subtype: 'square' }),
      (list) => list.current.map((entry) => entry.subtype),
    );
    const ink = probe(
      () => useAnnotationDefaults('ink'),
      (defaults) => defaults.current.color,
    );
    const panel = probe(
      () => useAnnotationProperties(),
      (properties) => properties.current.properties.length,
    );
    const { kernel, view } = await viewerWith(
      [interactionPlugin(), annotationPlugin()],
      Probes,
      { probes: [all, squares, ink, panel] },
      local,
    );
    try {
      expect(latest(all.seen)).toBe(0);
      expect(latest(ink.seen)).toBeUndefined();
      expect(latest(panel.seen)).toBe(0);

      const annotation = await openNotes(kernel);
      await waitFor(() => expect(latest(all.seen)).toBe(annotation.list().length));
      expect((latest(squares.seen) as string[]).every((subtype) => subtype === 'square')).toBe(
        true,
      );

      annotation.tools.updateDefaults('ink', { color: '#123456' });
      flushSync();
      await waitFor(() => expect(latest(ink.seen)).toBe('#123456'));

      const square = annotation.list().find((entry) => entry.subtype === 'square')!;
      annotation.selection.set([square.ref]);
      flushSync();
      await waitFor(() => expect(latest(panel.seen)).toBeGreaterThan(0));
    } finally {
      view.unmount();
      await local.destroy();
    }
  }, 30_000);

  it('the comment threads carry their page, and one thread is found by any of its annotations', async () => {
    const local = await engine();
    const target = signal<AnnotationRef | null>(null);
    const threads = probe(
      () => useCommentThreads(),
      (views) =>
        views.current.map((view) => ({ key: annotationKey(view.root.ref), label: view.pageLabel })),
    );
    const thread = probe(
      () => useCommentThread(() => target.value),
      (view) => (view.current ? annotationKey(view.current.root.ref) : null),
    );
    const { kernel, view } = await viewerWith(
      [interactionPlugin(), annotationPlugin()],
      Probes,
      { probes: [threads, thread] },
      local,
    );
    try {
      const annotation = await openNotes(kernel);
      const page = annotation.list()[0]!.page;
      const created = await annotation.create(page, {
        subtype: 'text',
        rect: { x: 100, y: 100, width: 24, height: 24 },
        contents: 'A question',
      });
      const note: Annotation = created.annotation;
      flushSync();
      const key = annotationKey(note.ref);
      await waitFor(() =>
        expect(latest(threads.seen) as { key: string; label: string }[]).toContainEqual({
          key,
          label: '1',
        }),
      );
      expect(latest(thread.seen)).toBeNull();

      target.value = note.ref;
      flushSync();
      expect(latest(thread.seen)).toBe(key);
    } finally {
      view.unmount();
      await local.destroy();
    }
  }, 30_000);

  it('useFilePickerProvider() installs once per document, and warns about a second component', async () => {
    resetDevWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const local = await engine();
    const install = () =>
      probe(
        () => useFilePickerProvider(),
        () => null,
      );
    const control: { hide?: () => void } = {};
    const { kernel, view } = await viewerWith(
      [interactionPlugin(), annotationPlugin()],
      Toggled,
      { probes: [install()], kept: [], control },
      local,
    );
    try {
      await openNotes(kernel);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      await local.destroy();
    }

    const second = await engine();
    const twice = await viewerWith(
      [interactionPlugin(), annotationPlugin()],
      Probes,
      { probes: [install(), install()] },
      second,
    );
    try {
      await openNotes(twice.kernel);
      await waitFor(() =>
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('useFilePickerProvider() is called from two mounted components'),
        ),
      );
    } finally {
      twice.view.unmount();
      await second.destroy();
    }
  }, 30_000);
});
