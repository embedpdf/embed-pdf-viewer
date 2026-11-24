// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Kernel } from '@embedpdf/core';
import { pageTransform } from '@embedpdf/core-geometry';
import { createLocalEngine } from '@embedpdf/engine';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import {
  formPlugin,
  FormToken,
  type FormDesignGroupChangedEvent,
  type FormGroupsChangedEvent,
  type FormState,
} from '@embedpdf/plugin-form';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { AnnotationLayer } from '../src/annotation';
import { FormLayer, useFormEvent, useFormState } from '../src/form';
import { makePageContext, PageProvider, useKernel, Viewer } from '../src/runtime';
import type { PageContextValue } from '../src/runtime';

const here = dirname(fileURLToPath(import.meta.url));
const packages = resolve(here, '..', '..', '..');
const blank = resolve(packages, 'engine', 'main', 'test', 'fixtures', 'hello_world.pdf');
const wasm = resolve(packages, 'engine', 'runtime', 'npm', 'wasm32', 'lib', 'embedpdf.wasm');

const BUYER = '#2563eb';
// The witness is named by nobody: second in the list, it gets the second of the eight colors.
const WITNESS = '#16a34a';
// The edge of a group's color. The fill beside it is a `color-mix()`, which happy-dom doesn't
// keep in a style: `@embedpdf/web`'s own tests check it.
const shadowOf = (color: string) => `inset 0 0 0 1px ${color}`;

/**
 * Fields for several people, in the form layer and in design mode: a field in a group shows in
 * its group's color (a fill and an edge), a field in no group as the PDF has it, nothing shows
 * while the tint is 0, and the form's state says who the groups are and who new fields are
 * placed for.
 */
describe('fields for several people', () => {
  afterEach(cleanup);

  it(
    'shows a field in its group’s color while filling and in design mode, and names whose it is',
    { timeout: 60_000 },
    async () => {
      const bytes = new Uint8Array(await readFile(blank));
      const wasmBinary = new Uint8Array(await readFile(wasm));
      const engine = await createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });
      const plugins = [interactionPlugin(), annotationPlugin(), formPlugin()];

      let kernel: Kernel | null = null;
      let setPage!: (page: PageContextValue) => void;
      let state!: FormState;
      const changes: FormDesignGroupChangedEvent[] = [];
      const named: FormGroupsChangedEvent[] = [];
      function Grab() {
        const current = useKernel();
        useEffect(() => {
          kernel = current;
        }, [current]);
        state = useFormState();
        useFormEvent(
          (form) => form.onDesignGroupChanged,
          (event) => changes.push(event),
        );
        useFormEvent(
          (form) => form.onGroupsChanged,
          (event) => named.push(event),
        );
        return null;
      }
      function Page() {
        const [page, set] = useState<PageContextValue | null>(null);
        setPage = set;
        return page ? (
          <PageProvider value={page}>
            <div data-layer="annotation">
              <AnnotationLayer />
            </div>
            <div data-layer="form">
              <FormLayer />
            </div>
          </PageProvider>
        ) : null;
      }

      const view = render(
        <Viewer
          engine={engine}
          plugins={plugins}
          initialDocuments={[{ source: { kind: 'bytes', id: 'blank', bytes } }]}
        >
          <Grab />
          <Page />
        </Viewer>,
      );

      try {
        await waitFor(() => expect(kernel?.tryCapability(FormToken, undefined)).toBeTruthy(), {
          timeout: 20_000,
        });
        const form = kernel!.capability(FormToken);
        const interaction = kernel!.capability(InteractionToken);
        await form.refresh();
        // The app tells the document who its groups are.
        act(() => form.setGroups([{ id: 'buyer', label: 'Dana Smith', color: BUYER }]));
        expect(named).toHaveLength(1);
        const page = kernel!.documents.getPage(0, 'blank')!.ref;
        const at = (y: number) => ({ x: 72, y, width: 160, height: 20 });
        await form.create({
          kind: 'text',
          name: 'name',
          groupId: 'buyer',
          widgets: [{ page, rect: at(100), color: '#94a3b8' }],
        });
        await form.create({
          kind: 'text',
          name: 'witness',
          groupId: 'witness',
          widgets: [{ page, rect: at(140), color: '#94a3b8' }],
        });
        await form.create({
          kind: 'listbox',
          name: 'choice',
          groupId: 'buyer',
          options: [{ label: 'One', value: 'One' }],
          widgets: [{ page, rect: { x: 72, y: 180, width: 160, height: 50 } }],
        });
        await form.create({
          kind: 'text',
          name: 'note',
          widgets: [{ page, rect: at(250), color: '#94a3b8' }],
        });

        act(() =>
          setPage(
            makePageContext(
              'blank',
              'test-view',
              page,
              0,
              { top: 0, right: 0, bottom: 0, left: 0 },
              pageTransform({
                pageSize: { width: 612, height: 792 },
                rotation: 0,
                scale: 1,
                dpr: 1,
              }),
              () => new DOMRect(0, 0, 612, 792),
            ),
          ),
        );

        // Filling: the buyer's field says whose it is, and its box shows the buyer's color.
        const input = (await waitFor(() =>
          screen.getByLabelText('name, Dana Smith'),
        )) as HTMLInputElement;
        const box = input.parentElement as HTMLElement;
        expect(box.style.boxShadow).toBe(shadowOf(BUYER));
        // A group nobody named shows too, in a color of the eight, and names nobody.
        const other = screen.getByLabelText('witness').parentElement as HTMLElement;
        expect(other.style.boxShadow).toBe(shadowOf(WITNESS));
        // A field in no group shows as the PDF has it.
        const none = screen.getByLabelText('note').parentElement as HTMLElement;
        expect(none.style.boxShadow).toBe('');
        // A list draws its own border: the color is that border's.
        const list = screen.getByLabelText('choice, Dana Smith') as HTMLSelectElement;
        expect(list.style.borderColor).toBe(BUYER);

        // The state: the form's groups, and who new fields are placed for.
        expect(state.designGroup).toBeNull();
        expect(state.groups).toEqual([
          { id: 'buyer', label: 'Dana Smith', color: BUYER },
          { id: 'witness', label: null, color: WITNESS },
        ]);
        act(() => form.setDesignGroup('buyer'));
        expect(state.designGroup).toBe('buyer');
        expect(changes).toEqual([{ groupId: 'buyer' }]);

        // Design mode: the fields are lent to the annotation layer, which shows each field in
        // its group's color, above its drawing, and the field in no group with none.
        act(() => interaction.activateTool('form-edit'));
        const layer = view.container.querySelector('[data-layer="annotation"]') as HTMLElement;
        const accentsOf = (color: string) =>
          [...layer.querySelectorAll<HTMLElement>('div')].filter(
            (element) => element.style.boxShadow === shadowOf(color),
          );
        await waitFor(() => {
          expect(accentsOf(BUYER)).toHaveLength(2);
          expect(accentsOf(WITNESS)).toHaveLength(1);
          for (const accent of accentsOf(BUYER)) expect(accent.style.pointerEvents).toBe('none');
        });
        expect(view.container.querySelector('[data-layer="form"] input')).toBeNull();

        // With the tint at 0, no field carries a color in either mode; the names stay.
        act(() => form.updateSettings({ fields: { tint: 0 } }));
        await waitFor(() =>
          expect(
            [...layer.querySelectorAll<HTMLElement>('div')].filter((element) =>
              [shadowOf(BUYER), shadowOf(WITNESS)].includes(element.style.boxShadow),
            ),
          ).toHaveLength(0),
        );
        act(() => interaction.activateTool('pointer'));
        const plain = (await waitFor(() =>
          screen.getByLabelText('name, Dana Smith'),
        )) as HTMLInputElement;
        expect((plain.parentElement as HTMLElement).style.boxShadow).toBe('');
      } finally {
        view.unmount();
        await engine.destroy();
      }
    },
  );
});
