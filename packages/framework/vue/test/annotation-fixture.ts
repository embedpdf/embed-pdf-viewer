/**
 * The annotation fixture open in a viewer over a real kernel and engine, with
 * a layer drawn on its first page: what the annotation layer's tests mount.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { h, shallowRef } from 'vue';
import type { Ref, VNodeChild } from 'vue';
import type { Kernel } from '@embedpdf/core';
import { pageTransform } from '@embedpdf/core-geometry';
import { createLocalEngine } from '@embedpdf/engine';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import type { AnnotationHostCapability } from '@embedpdf/plugin-annotation/contract/host';
import { expect } from 'vitest';
import { annotationPlugin } from '../src/annotation';
import { interactionPlugin } from '../src/interaction';
import { makePageContext, providePage } from '../src/runtime';
import type { PageContextValue } from '../src/runtime';
import { probe, settle, viewerWith } from './counter-plugin';

const here = dirname(fileURLToPath(import.meta.url));
const packages = resolve(here, '..', '..', '..');
const fixturePath = resolve(
  packages,
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'annotations.pdf',
);
const wasmPath = resolve(packages, 'engine', 'runtime', 'npm', 'wasm32', 'lib', 'embedpdf.wasm');

/** Retry `check` until it stops throwing, as the engine and Vue get there. */
export async function eventually<T>(check: () => T, timeout = 5_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    try {
      return check();
    } catch (error) {
      if (Date.now() - started > timeout) throw error;
      await settle();
      await new Promise((done) => setTimeout(done, 10));
    }
  }
}

const SIZE = { width: 612, height: 792 };

/** A page context for the fixture's first page, at `zoom` against a 100% of 1 pixel per point. */
function pageContext(
  annotation: AnnotationHostCapability,
  rotation: 0 | 90,
  zoom: number,
): PageContextValue {
  const first = annotation.list()[0]!;
  return makePageContext(
    'notes',
    'test-view',
    first.page,
    0,
    { top: 0, right: 0, bottom: 0, left: 0 },
    pageTransform({ pageSize: SIZE, rotation, scale: zoom, baseScale: 1, dpr: 1 }),
    () => new DOMRect(0, 0, SIZE.width, SIZE.height),
  );
}

/** The fixture open in a viewer, with `layer` drawn on its first page. */
export async function mountLayer(layer: () => VNodeChild, rotation: 0 | 90 = 0, zoom = 1) {
  const bytes = new Uint8Array(await readFile(fixturePath));
  // happy-dom's browser-shaped globals would steer the default wasm
  // resolution toward fetch(); hand the binary over directly instead.
  const wasmBinary = new Uint8Array(await readFile(wasmPath));
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });

  const page = shallowRef<PageContextValue | null>(null);
  const Page = probe(() => {
    providePage(page as Readonly<Ref<PageContextValue>>);
    return () => (page.value ? layer() : null);
  });
  const { kernel, wrapper } = await viewerWith(
    [interactionPlugin(), annotationPlugin()],
    () => h(Page),
    engine,
  );
  await kernel.documents.open({ kind: 'bytes', id: 'notes', bytes });
  const annotation = await eventually(() => {
    const capability = kernel.tryCapability(AnnotationToken, undefined);
    expect(capability).not.toBeNull();
    return capability!;
  }, 20_000);
  await annotation.whenSynced();
  page.value = pageContext(annotation, rotation, zoom);
  await settle();
  const close = async () => {
    wrapper.unmount();
    // The kernel closes its documents first (a second destroy joins the
    // viewer's), then the engine goes.
    await kernel.destroy();
    await engine.destroy();
  };
  return { annotation, kernel: kernel as Kernel, close };
}

