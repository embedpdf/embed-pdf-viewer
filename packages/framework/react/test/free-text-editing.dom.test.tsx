// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Kernel } from '@embedpdf/core';
import { pageTransform } from '@embedpdf/core-geometry';
import { createLocalEngine } from '@embedpdf/engine';
import { annotationPlugin, type AnnotationRef } from '@embedpdf/plugin-annotation';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { AnnotationLayer } from '../src/annotation';
import { makePageContext, PageProvider, useKernel, Viewer } from '../src/runtime';
import type { PageContextValue } from '../src/runtime';

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

/**
 * Typing into a free-text box through the DOM, over a real kernel and engine:
 * the React editor glue is what decides how often the engine is written. It
 * must show every keystroke at once and write once, after a pause in typing
 * or when the edit ends.
 */
async function openEditor() {
  const bytes = new Uint8Array(await readFile(fixturePath));
  // happy-dom's browser-shaped globals would steer the default wasm
  // resolution toward fetch(); hand the binary over directly instead.
  const wasmBinary = new Uint8Array(await readFile(wasmPath));
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });

  let kernel: Kernel | null = null;
  let setPage!: (page: PageContextValue) => void;
  function Grab() {
    const current = useKernel();
    useEffect(() => {
      kernel = current;
    }, [current]);
    return null;
  }
  function Stagelet() {
    const [page, set] = useState<PageContextValue | null>(null);
    setPage = set;
    return page ? (
      <PageProvider value={page}>
        <AnnotationLayer />
      </PageProvider>
    ) : null;
  }
  const view = render(
    <Viewer
      engine={engine}
      plugins={[interactionPlugin(), annotationPlugin()]}
      initialDocuments={[{ source: { kind: 'bytes', id: 'notes', bytes } }]}
    >
      <Grab />
      <Stagelet />
    </Viewer>,
  );

  await waitFor(
    () => {
      expect(kernel).not.toBeNull();
      expect(kernel!.tryCapability(AnnotationToken, undefined)).not.toBeNull();
    },
    { timeout: 20_000 },
  );
  const annotation = kernel!.capability(AnnotationToken);
  await annotation.whenSynced();
  const freeText = annotation.list().find((entry) => entry.subtype === 'free-text')!;
  // A synthetic page context: the layer only needs the transform seam.
  const size = { width: 612, height: 792 };
  const transform = pageTransform({ pageSize: size, rotation: 0, scale: 1, dpr: 1 });
  setPage(
    makePageContext(
      'notes',
      'test-view',
      freeText.page,
      0,
      { top: 0, right: 0, bottom: 0, left: 0 },
      transform,
      () =>
        ({
          left: 0,
          top: 0,
          right: size.width,
          bottom: size.height,
          width: size.width,
          height: size.height,
          x: 0,
          y: 0,
          toJSON() {},
        }) as DOMRect,
    ),
  );

  const writes: AnnotationRef[] = [];
  annotation.onUpdated((event) => writes.push(event.ref));
  annotation.beginTextEdit(freeText.ref);
  const editor = await waitFor(() => {
    const element = view.container.querySelector<HTMLElement>('[contenteditable="true"]');
    expect(element).not.toBeNull();
    return element!;
  });

  /** Replace the editor's first line with `text`, the way the browser reports typing. */
  const type = (text: string) => {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    if (first) first.nodeValue = text;
    else editor.textContent = text;
    fireEvent.input(editor);
  };

  const close = async () => {
    view.unmount();
    await engine.destroy();
  };
  return { annotation, ref: freeText.ref, writes, type, close };
}

describe('free-text typing through the React editor', () => {
  afterEach(cleanup);

  it(
    'shows each keystroke at once and writes once after a pause',
    { timeout: 45_000 },
    async () => {
      const { annotation, ref, writes, type, close } = await openEditor();
      try {
        type('Typed');
        type('Typed text');
        expect(annotation.get(ref)!.contents).toContain('Typed text');
        expect(writes).toHaveLength(0);

        await waitFor(() => expect(writes).toHaveLength(1), { timeout: 5_000 });
        expect(annotation.getRaw(ref)!.contents).toContain('Typed text');
        expect(annotation.get(ref)!.pending).toBeUndefined();
      } finally {
        await close();
      }
    },
  );

  it('ending the edit writes what was typed at once', { timeout: 45_000 }, async () => {
    const { annotation, ref, writes, type, close } = await openEditor();
    try {
      type('Finished');
      await annotation.endTextEdit();

      expect(writes).toHaveLength(1);
      expect(annotation.getRaw(ref)!.contents).toContain('Finished');
    } finally {
      await close();
    }
  });
});
