// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

import { pageTransform } from '@embedpdf/core-geometry';
import type { Kernel } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { annotationPlugin, AnnotationToken } from '@embedpdf/plugin-annotation';
import { interactionPlugin } from '@embedpdf/plugin-interaction';

import { AnnotationLayer } from '../src/annotation';
import { makePageContext, PageProvider, useKernel, Viewer } from '../src/runtime';
import type { PageContextValue } from '../src/runtime';

const here = dirname(fileURLToPath(import.meta.url));
const runtimeLib = resolve(here, '..', '..', '..', 'engine', 'runtime', 'npm', 'wasm32', 'lib');
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'annotations.pdf',
);

describe('free-text editor scroll', () => {
  afterEach(cleanup);

  it('shows the first line again once editing ends', { timeout: 45_000 }, async () => {
    const bytes = new Uint8Array(await readFile(fixturePath));
    // happy-dom's browser-shaped globals would steer the default wasm
    // resolution toward fetch(); hand the binary over directly instead.
    const wasmBinary = new Uint8Array(await readFile(resolve(runtimeLib, 'embedpdf.wasm')));
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });

    let kernel: Kernel | null = null;
    let setPage!: (page: PageContextValue) => void;
    function Grab() {
      const k = useKernel();
      useEffect(() => {
        kernel = k;
      }, [k]);
      return null;
    }
    function Layer() {
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
        <Layer />
      </Viewer>,
    );

    try {
      const box = await waitFor(
        () => {
          const text = kernel
            ?.tryCapability(AnnotationToken, undefined)
            ?.list({ subtype: 'free-text' })[0];
          expect(text).toBeTruthy();
          return text!;
        },
        { timeout: 20_000 },
      );
      const anno = kernel!.capability(AnnotationToken);
      const transform = pageTransform({
        pageSize: { width: 612, height: 792 },
        rotation: 0,
        scale: 1,
        dpr: 1,
      });
      setPage(
        makePageContext(
          'notes',
          'test-view',
          box.ref.page,
          0,
          { top: 0, right: 0, bottom: 0, left: 0 },
          transform,
          () =>
            ({
              left: 0,
              top: 0,
              right: 612,
              bottom: 792,
              width: 612,
              height: 792,
              x: 0,
              y: 0,
              toJSON() {},
            }) as DOMRect,
        ),
      );

      anno.beginTextEdit(box.ref);
      const editor = await waitFor(() => {
        const el = view.container.querySelector<HTMLElement>('[contenteditable="true"]');
        expect(el).not.toBeNull();
        return el!;
      });
      // Typed text runs past the box, and the browser scrolls it to follow
      // the caret down to the last line.
      await anno.setContents(
        box.ref,
        Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n'),
      );
      editor.scrollTop = 40;

      await anno.endTextEdit();
      await waitFor(() => expect(editor.getAttribute('contenteditable')).toBe('false'));
      expect(editor.scrollTop).toBe(0);
    } finally {
      view.unmount();
      await engine.destroy();
    }
  });
});
