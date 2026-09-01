import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createKernel } from '@embedpdf/core';
import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import { actionsPlugin } from '@embedpdf/plugin-actions';
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/internal';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/internal';
import { interactionPlugin } from '@embedpdf/plugin-interaction';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/types';
import type { FormUiEffect } from '../src/types';

/**
 * SUPPLEMENTARY real-world acceptance over the local `JS tests/` corpus —
 * the synthetic fixtures are the committed CI truth; these runs prove the
 * same wiring against documents authored elsewhere. The corpus is not
 * committed (repo-root `JS tests/`, owner's call), so every test here skips
 * cleanly when the folder is absent.
 */
const here = dirname(fileURLToPath(import.meta.url));
const corpus = (name: string) => resolve(here, '..', '..', '..', '..', 'JS tests', name);
const DOC_01 = corpus('01_document_and_page_events.pdf');
const DOC_02 = corpus('02_widget_annotation_events (1).pdf');
const DOC_03 = corpus('03_visibility_controls_js_and_hide_action_fixed.pdf');

const settle = () => new Promise((r) => setTimeout(r, 25));

describe('corpus acceptance (skips without the local JS tests folder)', () => {
  it.skipIf(!existsSync(DOC_01))(
    '01: the /OpenAction script runs as lifecycle — docStatus written, alert origin-tagged',
    async () => {
      const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
      const uiEffects: FormUiEffect[] = [];
      const kernel = createKernel({
        engine,
        plugins: [
          interactionPlugin(),
          actionsPlugin({
            javascript: {
              enabled: true,
              sandboxFactory: createQuickJsSandbox,
              now: () => Date.UTC(2026, 6, 15),
              utcOffsetMinutes: () => 0,
              randomSeed: () => 7,
            },
          }),
          annotationPlugin(),
          formPlugin(),
        ],
      });
      try {
        const bytes = new Uint8Array(await readFile(DOC_01));
        await kernel.documents.open({ kind: 'bytes', id: 'corpus-01', bytes });
        const actions = kernel.capability(ActionsHostToken);
        const form = kernel.capability(FormToken);
        actions.setUiAdapter({
          openUri: () => {},
          print: () => {},
          // Script alerts flow through the ONE adapter now (D9), origin
          // attached — an embedder handler sees everything.
          alert: (message, opts) =>
            uiEffects.push({
              kind: 'alert',
              message,
              icon: opts.icon,
              phase: opts.phase,
              origin: opts.origin,
            } as FormUiEffect),
        }); // fires the latch
        // Drain the open sequence (the queued script transaction included).
        await actions.dispatch({
          scope: 'annotation',
          event: 'cursorEnter',
          ref: { kind: 'objectNumber', pageObjectNumber: 999, annotObjectNumber: 1 },
          pon: 999,
        });
        await settle();
        await form.refresh();
        const docStatus = form.snapshot()?.fields.find((f) => f.name === 'docStatus');
        // The script wrote through the ScriptHost executor + the form
        // commit sink (lifecycle origin).
        expect(
          docStatus?.valueEntry.kind === 'scalar' ? docStatus.valueEntry.value : '',
        ).toContain('OpenAction');
        // Its app.alert carries the origin axis — the provider's default
        // matrix suppresses it; embedder handlers (like this one) see it.
        const alert = uiEffects.find((e) => e.kind === 'alert');
        expect(alert?.origin).toBe('lifecycle');
      } finally {
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );

  it.skipIf(!existsSync(DOC_02))(
    "02: hover colors — THE Phase-3 gate on the real corpus document",
    async () => {
      const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
      const kernel = createKernel({
        engine,
        plugins: [
          interactionPlugin(),
          actionsPlugin({
            openSequence: 'off',
            javascript: {
              enabled: true,
              sandboxFactory: createQuickJsSandbox,
              now: () => Date.UTC(2026, 6, 15),
              utcOffsetMinutes: () => 0,
              randomSeed: () => 7,
            },
          }),
          annotationPlugin(),
          formPlugin(),
        ],
      });
      try {
        const bytes = new Uint8Array(await readFile(DOC_02));
        await kernel.documents.open({ kind: 'bytes', id: 'corpus-02', bytes });
        const form = kernel.capability(FormToken);
        const annotation = kernel.capability(AnnotationHostToken);
        const actions = kernel.capability(ActionsHostToken);
        await form.refresh();
        const trigger = form.snapshot()?.fields.find((f) => f.widgets.length > 0);
        if (!trigger) throw new Error('no widget field in 02');
        const pon = trigger.widgets[0]!.pageObjectNumber;
        await annotation.reloadPage(pon);
        const hoverSquare = () =>
          annotation.pageItems(pon).find((item) => item.subtype === 'square');
        const before = hoverSquare()?.style.color;
        const drain = () =>
          actions.dispatch({
            scope: 'annotation',
            event: 'cursorEnter',
            ref: { kind: 'objectNumber', pageObjectNumber: 999, annotObjectNumber: 1 },
            pon: 999,
          });
        // The first field in 02 is `hoverTarget`'s trigger (obj:5, /AA E/X JS).
        form.notifyWidgetEvent(
          `obj:${trigger.fieldObjectNumber}`,
          {
            kind: 'objectNumber',
            pageObjectNumber: pon,
            annotObjectNumber: trigger.widgets[0]!.annotObjectNumber,
          },
          'cursorEnter',
        );
        await drain();
        await drain();
        // The square turned blue — the document changed, every surface agrees.
        expect(hoverSquare()?.style.color).not.toBe(before);
      } finally {
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );

  it.skipIf(!existsSync(DOC_03))(
    "03: the native tooltip works with scripting OFF (the corpus actions-≠-JS proof)",
    async () => {
      const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
      const kernel = createKernel({
        engine,
        plugins: [
          interactionPlugin(),
          actionsPlugin({ openSequence: 'off' }),
          annotationPlugin(),
          formPlugin(),
        ],
      });
      try {
        const bytes = new Uint8Array(await readFile(DOC_03));
        await kernel.documents.open({ kind: 'bytes', id: 'corpus-03', bytes });
        const form = kernel.capability(FormToken);
        const annotation = kernel.capability(AnnotationHostToken);
        const actions = kernel.capability(ActionsHostToken);
        await form.refresh();
        const field = (name: string) => {
          const f = form.snapshot()?.fields.find((c) => c.name === name);
          if (!f) throw new Error(`missing field ${name}`);
          return f;
        };
        const trigger = field('nativeTrigger');
        const target = field('nativeTarget');
        const pon = trigger.widgets[0]!.pageObjectNumber;
        await annotation.reloadPage(pon);
        const targetId = `obj:${target.widgets[0]!.annotObjectNumber}`;
        const painted = () => annotation.pageItems(pon).map((i) => i.id);
        const drain = () =>
          actions.dispatch({
            scope: 'annotation',
            event: 'cursorEnter',
            ref: { kind: 'objectNumber', pageObjectNumber: 999, annotObjectNumber: 1 },
            pon: 999,
          });
        const notify = (event: 'cursorEnter' | 'cursorExit') =>
          form.notifyWidgetEvent(
            `obj:${trigger.fieldObjectNumber}`,
            {
              kind: 'objectNumber',
              pageObjectNumber: pon,
              annotObjectNumber: trigger.widgets[0]!.annotObjectNumber,
            },
            event,
          );

        expect(painted()).not.toContain(targetId); // hidden at rest
        notify('cursorEnter');
        await drain();
        expect(painted()).toContain(targetId); // /E → Hide /H false
        notify('cursorExit');
        await drain();
        await drain();
        expect(painted()).not.toContain(targetId); // /X → Hide
      } finally {
        await kernel.destroy();
        await engine.destroy();
      }
    },
  );
});
