import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createKernel } from '@embedpdf/core';
import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import type { AnnotationRef } from '@embedpdf/engine-core/runtime';
import { actionsPlugin } from '@embedpdf/plugin-actions';
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { interactionPlugin } from '@embedpdf/plugin-interaction';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/types';

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
 * THE PHASE-3 GATE (corpus 02's shape, synthetic bytes): hover a widget and
 * a script recolors a named square through `getAnnots` + writes a status
 * field. Full ISO: both are DOCUMENT mutations — an authorized session
 * persists them (engine `/AP` regeneration, every surface agrees), an
 * unauthorized session runs the script, gets refusals, and changes NOTHING.
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
  const trigger = form.snapshot()?.fields.find((f) => f.name === 'hoverTrigger');
  if (!trigger) throw new Error('hoverTrigger missing');
  const pon = trigger.widgets[0]!.pageObjectNumber;
  await annotation.reloadPage(pon);

  const squareStyle = () => {
    // hoverSquare sits at x≈300; the bystander square at x≈450.
    const squares = annotation
      .pageItems(pon)
      .filter((item) => item.subtype === 'square')
      .sort((a, b) => a.geom.rect.x - b.geom.rect.x);
    return {
      hoverSquare: squares[0]!.style,
      bystander: squares[1]!.style,
    };
  };
  const triggerRef: AnnotationRef = {
    kind: 'objectNumber',
    pageObjectNumber: pon,
    annotObjectNumber: trigger.widgets[0]!.annotObjectNumber,
  };
  const notify = (event: 'cursorEnter' | 'cursorExit') =>
    form.notifyWidgetEvent(`obj:${trigger.fieldObjectNumber}`, triggerRef, event);
  const drain = () =>
    actions.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: { kind: 'objectNumber', pageObjectNumber: 999, annotObjectNumber: 1 },
      pon: 999,
    });
  const statusValue = () => {
    const field = form.snapshot()?.fields.find((f) => f.name === 'eventStatus');
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
    await using t = await boot();
    const before = t.squareStyle();

    t.notify('cursorEnter');
    await t.drain();
    await t.drain();
    const during = t.squareStyle();
    // The square is BLUE now — real document truth (the model reconciles
    // only from engine reads, so this IS the persisted /C + regenerated /AP).
    expect(during.hoverSquare.color).not.toBe(before.hoverSquare.color);
    expect(during.hoverSquare.interiorColor).not.toBe(before.hoverSquare.interiorColor);
    expect(during.bystander.color).toBe(before.bystander.color); // untouched
    expect(t.statusValue()).toBe('enter'); // the field write persisted too

    t.notify('cursorExit');
    await t.drain();
    await t.drain();
    const after = t.squareStyle();
    // The exit script writes the ORIGINAL values — round-trips to equality.
    expect(after.hoverSquare.color).toBe(before.hoverSquare.color);
    expect(t.statusValue()).toBe('exit');
  });

  it('unauthorized: the script runs, every effect is refused, nothing changes anywhere', async () => {
    await using t = await boot(['doc.open', 'doc.render', 'doc.forms.read', 'doc.annotate.read']);
    const before = t.squareStyle();
    const scriptDiagnostics: string[] = [];
    t.actions.onDiagnostic((d) => scriptDiagnostics.push(`${d.code}`));

    t.notify('cursorEnter');
    await t.drain();
    await t.drain();
    const after = t.squareStyle();
    expect(after.hoverSquare.color).toBe(before.hoverSquare.color); // byte-stable
    expect(t.statusValue()).toBe(''); // the field write was refused too
    expect(scriptDiagnostics.some((code) => code === 'executor-failed')).toBe(true);
  });
});
