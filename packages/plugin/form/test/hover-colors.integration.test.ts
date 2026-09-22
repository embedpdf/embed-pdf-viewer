import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createKernel } from '@embedpdf/core';
import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import { toPageRef, type AnnotationRef } from '@embedpdf/engine-core/runtime';
import { actionsPlugin } from '@embedpdf/plugin-actions';
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { interactionPlugin } from '@embedpdf/plugin-interaction';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'engine',
  'main',
  'test',
  'fixtures',
  'action_hover_colors.pdf',
);

/**
 * Hover scripts (the shape of corpus document 02, with synthetic bytes):
 * hovering a widget runs a script that recolors a named square through
 * `getAnnots` and writes a status field. Both are document mutations: an authorized session
 * persists them (engine `/AP` regeneration, every surface agrees), an
 * unauthorized session runs the script, gets refusals, and changes nothing.
 */
async function boot(scope?: string[]) {
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
          now: () => Date.UTC(2026, 6, 15, 9, 30, 0),
          utcOffsetMinutes: () => 0,
          randomSeed: () => 7,
        },
      }),
      annotationPlugin(),
      formPlugin(),
    ],
  });
  const bytes = new Uint8Array(await readFile(fixturePath));
  await kernel.documents.open(
    { kind: 'bytes', id: 'hover-colors', bytes },
    scope ? ({ scope } as never) : undefined,
  );
  const form = kernel.capability(FormToken);
  const annotation = kernel.capability(AnnotationHostToken);
  const actions = kernel.capability(ActionsHostToken);
  await form.refresh();
  const trigger = form.getSnapshot()?.fields.find((field) => field.name === 'hoverTrigger');
  if (!trigger) throw new Error('hoverTrigger missing');
  const page = trigger.widgets[0]!.page!;
  await annotation.whenSynced();

  // A square's geometry is the `rect` member of the geometry union.
  const rectX = ({ geometry }: ReturnType<typeof annotation.listPageItems>[number]): number => {
    if (geometry.kind !== 'rect') throw new Error(`square with ${geometry.kind} geometry`);
    return geometry.rect.x;
  };
  const squareStyle = () => {
    // hoverSquare sits at x≈300; the bystander square at x≈450.
    const squares = annotation
      .listPageItems(page)
      .filter((item) => item.subtype === 'square')
      .sort((left, right) => rectX(left) - rectX(right));
    return {
      hoverSquare: squares[0]!.style,
      bystander: squares[1]!.style,
    };
  };
  const triggerRef: AnnotationRef = {
    kind: 'objectNumber',
    page,
    annotObjectNumber: trigger.widgets[0]!.annotObjectNumber,
  };
  const notify = (event: 'cursorEnter' | 'cursorExit') =>
    form.notifyWidgetEvent(trigger.ref, triggerRef, event);
  const drain = () =>
    actions.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: { kind: 'objectNumber', page: toPageRef(999), annotObjectNumber: 1 },
      page: toPageRef(999),
    });
  const statusValue = () => {
    const field = form.getSnapshot()?.fields.find((field) => field.name === 'eventStatus');
    return field?.valueEntry.kind === 'scalar' ? field.valueEntry.value : '';
  };

  return {
    form,
    annotation,
    actions,
    squareStyle,
    notify,
    drain,
    statusValue,
    async [Symbol.asyncDispose]() {
      await kernel.destroy();
      await engine.destroy();
    },
  };
}

describe("the Phase-3 gate: 02's hover colors", () => {
  it('authorized: hover recolors the square as a DOCUMENT mutation; exit restores it', async () => {
    await using harness = await boot();
    const before = harness.squareStyle();

    harness.notify('cursorEnter');
    await harness.drain();
    await harness.drain();
    const during = harness.squareStyle();
    // The square is blue now — real document truth (the model reconciles
    // only from engine reads, so this is the persisted /C + regenerated /AP).
    expect(during.hoverSquare.color).not.toBe(before.hoverSquare.color);
    expect(during.hoverSquare.interiorColor).not.toBe(before.hoverSquare.interiorColor);
    expect(during.bystander.color).toBe(before.bystander.color); // untouched
    expect(harness.statusValue()).toBe('enter'); // the field write persisted too

    harness.notify('cursorExit');
    await harness.drain();
    await harness.drain();
    const after = harness.squareStyle();
    // The exit script writes the original values — round-trips to equality.
    expect(after.hoverSquare.color).toBe(before.hoverSquare.color);
    expect(harness.statusValue()).toBe('exit');
  });

  it('unauthorized: the script runs, every effect is refused, nothing changes anywhere', async () => {
    await using harness = await boot([
      'doc.open',
      'doc.render',
      'doc.forms.read',
      'doc.annotate.read',
    ]);
    const before = harness.squareStyle();
    const scriptDiagnostics: string[] = [];
    harness.actions.onDiagnostic((diagnostic) => scriptDiagnostics.push(`${diagnostic.code}`));

    harness.notify('cursorEnter');
    await harness.drain();
    await harness.drain();
    const after = harness.squareStyle();
    expect(after.hoverSquare.color).toBe(before.hoverSquare.color); // byte-stable
    expect(harness.statusValue()).toBe(''); // the field write was refused too
    expect(scriptDiagnostics.some((code) => code === 'executor-failed')).toBe(true);
  });
});
