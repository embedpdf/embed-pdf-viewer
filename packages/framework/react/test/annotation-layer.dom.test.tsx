// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { annotationKey, type Kernel } from '@embedpdf/core';
import { pageTransform } from '@embedpdf/core-geometry';
import { createLocalEngine } from '@embedpdf/engine';
import { annotationPlugin, type Annotation } from '@embedpdf/plugin-annotation';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AnnotationLayer,
  useAnnotationAnchor,
  useAnnotationState,
  useRichTextEditor,
  type AnnotationRenderer,
  type AnnotationRendererProps,
  type HandleProps,
} from '../src/annotation';
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
 * The annotation layer over a real kernel and engine: renderers get the
 * record, your own handles draw in place of the layer's, the chrome paints
 * through its CSS variables, and the hooks follow the annotation.
 */
async function mount(layer: (page: PageContextValue) => React.ReactNode) {
  const bytes = new Uint8Array(await readFile(fixturePath));
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
    return page ? <PageProvider value={page}>{layer(page)}</PageProvider> : null;
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
  const first = annotation.list()[0]!;
  const size = { width: 612, height: 792 };
  const transform = pageTransform({ pageSize: size, rotation: 0, scale: 1, dpr: 1 });
  act(() =>
    setPage(
      makePageContext(
        'notes',
        'test-view',
        first.page,
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
    ),
  );
  const close = async () => {
    view.unmount();
    await engine.destroy();
  };
  return { annotation, view, close };
}

describe('the annotation layer', () => {
  afterEach(cleanup);

  it('renderers get the record, the box and the hover; your handles draw in place of the layer’s', async () => {
    const seen: AnnotationRendererProps[] = [];
    const handles: HandleProps[] = [];
    const renderers: AnnotationRenderer[] = [
      {
        for: (annotation) => annotation.subtype === 'free-text',
        component: (props: AnnotationRendererProps) => {
          seen.push(props);
          return <span data-testid="look">{props.annotation.subtype}</span>;
        },
      },
    ];
    const Handle = (props: HandleProps): React.ReactElement => {
      handles.push(props);
      return <i data-testid="handle" />;
    };
    const { annotation, view, close } = await mount(() => (
      <AnnotationLayer renderers={renderers} components={{ Handle }} />
    ));
    try {
      await waitFor(() => expect(view.getAllByTestId('look').length).toBeGreaterThan(0));
      const last = seen[seen.length - 1]!;
      expect(last.annotation.subtype).toBe('free-text');
      expect(last.box.width).toBeGreaterThan(0);
      expect(last.hovered).toBe(false);
      expect(last.interactive).toBe(false);

      const square = annotation
        .list()
        .find((entry) => entry.subtype === 'square' || entry.subtype === 'circle');
      expect(square).toBeDefined();
      act(() => annotation.selection.set([square!.ref]));
      await waitFor(() => expect(view.getAllByTestId('handle').length).toBeGreaterThan(0));
      expect(handles.some((handle) => handle.kind === 'corner')).toBe(true);
      // The outline is painted through its variable, then the accent's.
      const painted = [...view.container.querySelectorAll('[style]')].map(
        (element) => element.getAttribute('style') ?? '',
      );
      expect(painted.some((style) => style.includes('--epdf-annotation-outline'))).toBe(true);
    } finally {
      await close();
    }
  }, 30_000);

  it('an interactive renderer takes the pointer; one that only draws stays inert', async () => {
    const renderers: AnnotationRenderer[] = [
      {
        for: (annotation) => annotation.subtype === 'free-text',
        component: ({ interactive }: AnnotationRendererProps) => (
          <button data-testid="widget">{interactive ? 'live' : 'drawn'}</button>
        ),
        interactive: true,
      },
      {
        for: (annotation) => annotation.subtype === 'square' || annotation.subtype === 'circle',
        component: () => <span data-testid="drawn" />,
      },
    ];
    const { view, close } = await mount(() => <AnnotationLayer renderers={renderers} />);
    try {
      await waitFor(() => expect(view.getAllByTestId('widget').length).toBeGreaterThan(0));
      const widget = view.getAllByTestId('widget')[0]!;
      expect(widget.textContent).toBe('live');
      expect(widget.closest('[inert]')).toBeNull();
      expect(widget.parentElement!.style.pointerEvents).toBe('auto');
      await waitFor(() => expect(view.getAllByTestId('drawn').length).toBeGreaterThan(0));
      expect(view.getAllByTestId('drawn')[0]!.closest('[inert]')).not.toBeNull();
    } finally {
      await close();
    }
  }, 30_000);

  it('useAnnotationState, useAnnotationAnchor and useRichTextEditor follow the annotation', async () => {
    const states: { selected: readonly Annotation[]; editing: Annotation | null }[] = [];
    const anchors: unknown[] = [];
    const editing = new Map<string, boolean>();
    let target: Annotation | null = null;
    function Probe() {
      states.push(useAnnotationState());
      anchors.push(useAnnotationAnchor(target?.ref ?? null));
      return null;
    }
    const TextBox = ({ annotation, page }: AnnotationRendererProps) => {
      const editor = useRichTextEditor(annotation, page);
      const key = annotationKey(annotation.ref);
      editing.set(key, editor.editing);
      return <div ref={editor.ref} data-testid={key} style={editor.style} />;
    };
    const renderers: AnnotationRenderer[] = [
      { for: (annotation) => annotation.subtype === 'free-text', component: TextBox },
    ];
    const { annotation, view, close } = await mount(() => (
      <>
        <AnnotationLayer renderers={renderers} />
        <Probe />
      </>
    ));
    try {
      target = annotation.list().find((entry) => entry.subtype === 'free-text')!;
      act(() => annotation.selection.set([target!.ref]));
      await waitFor(() => expect(states[states.length - 1]!.selected).toHaveLength(1));
      expect(anchors[anchors.length - 1]).toMatchObject({ page: target.page });

      act(() => annotation.text.begin(target!.ref));
      await waitFor(() => expect(states[states.length - 1]!.editing?.ref).toEqual(target!.ref));
      const key = annotationKey(target.ref);
      await waitFor(() => expect(editing.get(key)).toBe(true));
      // The renderer's element is the editor; the layer draws no text box of its own for it.
      expect(view.getByTestId(key).getAttribute('contenteditable')).toBe('true');
      expect(view.container.querySelectorAll('[contenteditable="true"]')).toHaveLength(1);
      // It can take the keys and the pointer: nothing above it is inert while typing.
      expect(view.getByTestId(key).closest('[inert]')).toBeNull();
      expect(view.getByTestId(key).style.pointerEvents).toBe('auto');

      await act(() => annotation.text.end());
      await waitFor(() => expect(editing.get(key)).toBe(false));
      expect(view.getByTestId(key).closest('[inert]')).not.toBeNull();
    } finally {
      await close();
    }
  }, 30_000);
});
