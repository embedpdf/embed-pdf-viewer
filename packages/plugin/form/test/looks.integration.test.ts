/**
 * What a filled widget looks like before and after the engine answers, on a real engine with
 * the form's real scripts: a value is pending until the answer, and the painter draws it as the
 * format script wrote it, then and after; a checkbox's state is never pending (its pictures of
 * both states are held).
 */
import { createKernel, type DocumentHandle } from '@embedpdf/core';
import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import { CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import type { AnnotationRef, Engine, PageRef } from '@embedpdf/engine-core/runtime';
import { actionsPlugin } from '@embedpdf/plugin-actions';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { describe, expect, it } from 'vitest';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';
import { gated, type HeldChange } from './helpers/fill-form';

async function bytesOf(engine: Engine): Promise<Uint8Array> {
  const doc = await engine.open(
    { kind: 'bytes', id: 'author', bytes: CHANGE_FIXTURE_PDF.slice() },
    { scope: ['*'] },
  );
  const page = (await doc.pages.list()).pages[1]!.ref;
  await doc.forms.create({
    family: 'text',
    name: 'amount',
    widgets: [{ page, rect: { x: 20, y: 20, width: 120, height: 20 }, fontFamily: 'helvetica', fontSize: 10 }],
    actions: { format: { type: 'javascript', script: 'event.value = "$" + event.value;' } },
  });
  await doc.forms.create({
    family: 'checkbox',
    name: 'agree',
    widgets: [{ page, rect: { x: 20, y: 60, width: 16, height: 16 } }],
  });
  const bytes = await doc.download();
  await doc.close();
  return bytes;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a filled widget looks', () => {
  it('pending until the answer, drawn as its format script wrote it then and after', async () => {
    const real = createLocalEngine({ runtime: { prefer: 'wasm' } });
    const held: HeldChange[] = [];
    let holding = false;
    let inner: DocumentHandle | null = null;
    const kernel = createKernel({
      engine: gated(real, held, (doc) => (inner = doc), () => holding),
      plugins: [
        interactionPlugin(),
        actionsPlugin({ javascript: { enabled: true, sandboxFactory: createQuickJsSandbox } }),
        formPlugin(),
      ],
    });
    try {
      await kernel.documents.open({ kind: 'bytes', id: 'looks', bytes: await bytesOf(real) });
      const form = kernel.capability(FormToken);
      await form.refresh();
      const fieldNamed = (name: string) => form.get({ kind: 'fqn', name })!;
      const widgetOf = (name: string): AnnotationRef => {
        const widget = fieldNamed(name).widgets[0]!;
        return { kind: 'objectNumber', page: widget.page!, objectNumber: widget.objectNumber };
      };
      const page = fieldNamed('amount').widgets[0]!.page as PageRef;
      const shownOf = (name: string) =>
        form.listShownWidgets(page).find(
          (widget) => widget.ref.kind === 'objectNumber' && widget.ref.objectNumber === fieldNamed(name).widgets[0]!.objectNumber,
        )!;
      const paintedText = (name: string) =>
        (form.getWidgetPainting(widgetOf(name))?.scene ?? [])
          .flatMap((node) => (node.kind === 'textRun' ? [node.text] : []))
          .join(' ');
      expect(shownOf('amount').pending).toBe(false);

      holding = true;
      const filled = form.setValue({ kind: 'fqn', name: 'amount' }, { value: '12' });
      // The scripts run first; then the change waits for the engine.
      for (let tries = 0; tries < 200 && held.length === 0; tries += 1) await settle();
      expect(held).toHaveLength(1);
      expect(shownOf('amount').pending).toBe(true);
      expect(paintedText('amount')).toBe('$12');

      holding = false;
      const write = held.shift()!;
      await (inner as unknown as DocumentHandle)
        .apply(write.change, write.options as never)
        .then(write.resolve, write.reject);
      await filled;
      await settle();
      // Answered: the view is the engine's, and the painter still draws the formatted text.
      expect(shownOf('amount').pending).toBe(false);
      expect(paintedText('amount')).toBe('$12');

      // A checkbox switches between pictures it holds: never pending.
      holding = true;
      const clicked = form.setValue({ kind: 'fqn', name: 'agree' }, { checked: true });
      for (let tries = 0; tries < 200 && held.length === 0; tries += 1) await settle();
      expect(shownOf('agree').appearanceState).not.toBe('Off');
      expect(shownOf('agree').pending).toBe(false);
      holding = false;
      for (const next of held.splice(0)) {
        await (inner as unknown as DocumentHandle)
          .apply(next.change, next.options as never)
          .then(next.resolve, next.reject);
      }
      await clicked;
    } finally {
      await kernel.destroy();
    }
  });
});
