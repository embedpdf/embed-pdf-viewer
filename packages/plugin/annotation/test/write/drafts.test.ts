/**
 * An ink drawing that waits for its next stroke. A press on an annotation, a
 * marquee or a text edit takes the draft's place, and finishes the drawing
 * first: its strokes become an annotation. Only a cancel drops them.
 */
import { annotationKey } from '@embedpdf/core';
import type { Message } from '@embedpdf/core-annotation';
import { quadFromRect } from '@embedpdf/core-geometry';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EMPTY,
  IN_TEXT_BOX,
  inkCreates,
  inkDrawingHarness,
  ON_SQUARE,
  SQUARE,
  TEXT_BOX,
} from '../fixtures/ink-drawing';
import { PAGE, PAGE2, type AnnotationHarness } from '../harness';

/** The pen goes down at `x` and draws; it stays down. */
const penDown = (harness: AnnotationHarness, x = 300): void => {
  harness.capability.createPointer('ink', 'down', PAGE, { x, y: 300 });
  harness.capability.createPointer('ink', 'move', PAGE, { x: x + 40, y: 320 });
  harness.capability.createPointer('ink', 'move', PAGE, { x: x + 80, y: 300 });
};

/** One stroke of the pen, lifted: the drawing now waits for its next stroke. */
const stroke = (harness: AnnotationHarness, x = 300): void => {
  penDown(harness, x);
  harness.capability.createPointer('ink', 'up', PAGE, { x: x + 80, y: 300 });
};

/** One stroke by a caller that sends the core's messages itself: no wait is started for it. */
const strokeWithoutWait = (harness: AnnotationHarness, x: number): void => {
  const sample = (phase: 'down' | 'move' | 'up', point: { x: number; y: number }): Message => ({
    type: 'createPointer',
    phase,
    subtype: 'ink',
    preset: 'ink',
    deferInkCommit: true,
    in: { page: PAGE, point, shift: false },
  });
  harness.commit(sample('down', { x, y: 400 }));
  harness.commit(sample('move', { x: x + 40, y: 420 }));
  harness.commit(sample('up', { x: x + 80, y: 400 }));
};

describe('an ink drawing that waits for its next stroke', () => {
  it('stays a draft after the pen lifts', async () => {
    const harness = await inkDrawingHarness();
    stroke(harness);
    expect(harness.model().draft).toMatchObject({ kind: 'create-ink', drawing: false });
    expect(inkCreates(harness)).toHaveLength(0);
  });

  it('becomes an annotation when a press lands on another annotation, which is selected', async () => {
    const harness = await inkDrawingHarness();
    stroke(harness);

    harness.capability.editPointer('down', PAGE, ON_SQUARE, false);
    expect(inkCreates(harness)).toHaveLength(1);
    expect(harness.model().draft).toMatchObject({ kind: 'move' });
    harness.capability.editPointer('up', PAGE, ON_SQUARE, false);

    expect(harness.model().order).toHaveLength(3);
    expect(harness.model().selected).toEqual([annotationKey(SQUARE)]);
    // The wait running out afterwards makes no second annotation.
    harness.capability.finishInkDraft();
    expect(inkCreates(harness)).toHaveLength(1);
  });

  it('becomes an annotation when a marquee starts', async () => {
    const harness = await inkDrawingHarness();
    stroke(harness);

    harness.capability.marqueePointer('down', PAGE, EMPTY, false);

    expect(inkCreates(harness)).toHaveLength(1);
    expect(harness.model().draft).toMatchObject({ kind: 'marquee' });
  });

  it('becomes an annotation when a text box is opened for typing in code', async () => {
    const harness = await inkDrawingHarness();
    stroke(harness);

    harness.capability.text.begin(TEXT_BOX);

    expect(inkCreates(harness)).toHaveLength(1);
    expect(harness.model().editing).toBe(annotationKey(TEXT_BOX));
  });

  it('becomes an annotation when a double-click opens a text box for typing', async () => {
    const harness = await inkDrawingHarness();
    stroke(harness);

    expect(harness.capability.beginTextEditAt(PAGE, IN_TEXT_BOX)).toBe(true);

    expect(inkCreates(harness)).toHaveLength(1);
    expect(harness.model().editing).toBe(annotationKey(TEXT_BOX));
  });

  it('is made as the setting says a tool’s create is: here, back to the default tool', async () => {
    const harness = await inkDrawingHarness({ afterCreate: { select: false, tool: 'default' } });
    stroke(harness);

    harness.capability.editPointer('down', PAGE, ON_SQUARE, false);

    expect(inkCreates(harness)).toHaveLength(1);
    expect(harness.interaction.activateDefaultTool).toHaveBeenCalledOnce();
    expect(harness.model().selected).toEqual([annotationKey(SQUARE)]);
  });

  it('takes its next stroke as before: two strokes are one annotation', async () => {
    const harness = await inkDrawingHarness();
    stroke(harness, 300);
    stroke(harness, 320);
    expect(inkCreates(harness)).toHaveLength(0);

    harness.capability.finishInkDraft();

    expect(inkCreates(harness)).toHaveLength(1);
    expect(inkCreates(harness)[0]).toHaveLength(2);
  });

  it('is not finished while the pen is still down', async () => {
    const harness = await inkDrawingHarness();
    penDown(harness);

    harness.capability.editPointer('down', PAGE, ON_SQUARE, false);

    expect(inkCreates(harness)).toHaveLength(0);
    expect(harness.model().order).toHaveLength(2);
  });

  it('is dropped by a cancel, and no later press brings it back', async () => {
    const harness = await inkDrawingHarness();
    stroke(harness);

    harness.capability.draft.cancel();
    harness.capability.editPointer('down', PAGE, ON_SQUARE, false);
    harness.capability.finishInkDraft();

    expect(inkCreates(harness)).toHaveLength(0);
    expect(harness.model().order).toHaveLength(2);
  });
});

describe('a message that takes the place of a waiting drawing', () => {
  it('selects only what a press with shift hit, not the new drawing', async () => {
    const harness = await inkDrawingHarness();
    stroke(harness);

    harness.capability.editPointer('down', PAGE, ON_SQUARE, true);

    expect(inkCreates(harness)).toHaveLength(1);
    expect(harness.model().selected).toEqual([annotationKey(SQUARE)]);
  });

  it('deletes what was selected, and keeps the drawing', async () => {
    const harness = await inkDrawingHarness();
    stroke(harness);
    harness.commit({ type: 'select', ids: [annotationKey(SQUARE)] });

    await harness.capability.selection.delete();

    expect(inkCreates(harness)).toHaveLength(1);
    expect(harness.remove).toHaveBeenCalledOnce();
    expect(harness.remove).toHaveBeenCalledWith(SQUARE);
    expect(harness.model().byId[annotationKey(SQUARE)]).toBeUndefined();
    expect(harness.model().order).toHaveLength(2);
  });

  it('keeps the drawing when code makes a markup', async () => {
    const harness = await inkDrawingHarness();
    stroke(harness);

    const words = quadFromRect({ x: 10, y: 20, width: 80, height: 15 });
    harness.capability.createMarkup('highlight', PAGE, [words], 'highlight');

    expect(inkCreates(harness)).toHaveLength(1);
    expect(harness.model().draft).toBeNull();
  });

  it('keeps the drawing when the pen goes down on another page, where a new one starts', async () => {
    const harness = await inkDrawingHarness();
    stroke(harness);

    harness.capability.createPointer('ink', 'down', PAGE2, { x: 100, y: 100 });

    expect(inkCreates(harness)).toHaveLength(1);
    expect(inkCreates(harness)[0]).toHaveLength(1);
    expect(harness.model().draft).toMatchObject({ kind: 'create-ink', page: PAGE2, drawing: true });
  });
});

describe('the wait for the next stroke', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs from each pen-up, and ends in one selected annotation with every stroke', async () => {
    const harness = await inkDrawingHarness();
    vi.useFakeTimers();
    stroke(harness, 300);
    vi.advanceTimersByTime(400);
    stroke(harness, 320);

    vi.advanceTimersByTime(799);
    expect(inkCreates(harness)).toHaveLength(0);
    vi.advanceTimersByTime(1);

    expect(inkCreates(harness)).toHaveLength(1);
    expect(inkCreates(harness)[0]).toHaveLength(2);
    expect(harness.model().selected).toHaveLength(1);
    expect(harness.model().selected).not.toContain(annotationKey(SQUARE));
  });

  it('ends at once for a download, but never while the pen is still down', async () => {
    const harness = await inkDrawingHarness();
    vi.useFakeTimers();
    penDown(harness);
    await harness.ctx.settle();
    expect(inkCreates(harness)).toHaveLength(0);

    harness.capability.createPointer('ink', 'up', PAGE, { x: 380, y: 300 });
    await harness.ctx.settle();
    expect(inkCreates(harness)).toHaveLength(1);

    vi.advanceTimersByTime(800);
    expect(inkCreates(harness)).toHaveLength(1);
  });

  it('of a drawing that is gone cannot finish a newer one', async () => {
    const harness = await inkDrawingHarness();
    vi.useFakeTimers();
    stroke(harness);
    vi.advanceTimersByTime(100);
    harness.capability.draft.cancel();
    strokeWithoutWait(harness, 100);

    // The first drawing's wait runs out.
    vi.advanceTimersByTime(700);

    expect(inkCreates(harness)).toHaveLength(0);
    expect(harness.model().draft).toMatchObject({ kind: 'create-ink', drawing: false });
  });

  it('that runs out sends the user back to the default tool when the setting says so', async () => {
    const harness = await inkDrawingHarness(
      { afterCreate: { select: true, tool: 'default' } },
      { wired: true },
    );
    harness.changeTool('ink');
    vi.useFakeTimers();
    stroke(harness);

    vi.advanceTimersByTime(800);

    expect(inkCreates(harness)).toHaveLength(1);
    expect(harness.interaction.activateDefaultTool).toHaveBeenCalledOnce();
  });

  it('ends with a tool change, and the tool the user picked stays', async () => {
    const harness = await inkDrawingHarness(
      { afterCreate: { select: true, tool: 'default' } },
      { wired: true },
    );
    harness.changeTool('ink');
    stroke(harness);

    harness.changeTool('ink-highlight');

    expect(inkCreates(harness)).toHaveLength(1);
    expect(harness.interaction.activateDefaultTool).not.toHaveBeenCalled();
  });

  it('a stroke still under the pen goes with the tool on a tool change', async () => {
    const harness = await inkDrawingHarness(undefined, { wired: true });
    harness.changeTool('ink');
    penDown(harness);

    harness.changeTool('ink-highlight');

    expect(inkCreates(harness)).toHaveLength(0);
    expect(harness.model().draft).toBeNull();
  });
});

describe('a shape that is made click by click', () => {
  it('waits for its next click from its first corner until it is finished: a polygon', async () => {
    const { capability } = await inkDrawingHarness();
    expect(capability.hasCreationAwaitingClick()).toBe(false);

    capability.createPointer('polygon', 'down', PAGE, { x: 300, y: 300 });
    expect(capability.hasCreationAwaitingClick()).toBe(true);
    capability.createPointer('polygon', 'down', PAGE, { x: 380, y: 300 });
    capability.createPointer('polygon', 'down', PAGE, { x: 340, y: 360 });
    expect(capability.hasCreationAwaitingClick()).toBe(true);

    // The second press of a double-click finishes it.
    capability.createPointer('polygon', 'down', PAGE, { x: 340, y: 360 }, true);
    expect(capability.hasCreationAwaitingClick()).toBe(false);
  });

  it('waits for its next click after the tip and after the knee: a callout', async () => {
    const { capability } = await inkDrawingHarness();

    capability.createPointer('free-text-callout', 'down', PAGE, { x: 300, y: 300 });
    expect(capability.hasCreationAwaitingClick()).toBe(true);
    capability.createPointer('free-text-callout', 'down', PAGE, { x: 360, y: 340 });
    expect(capability.hasCreationAwaitingClick()).toBe(true);

    capability.draft.cancel();
    expect(capability.hasCreationAwaitingClick()).toBe(false);
  });

  it('is not what a pen drawing is: its next stroke starts only on the empty page', async () => {
    const harness = await inkDrawingHarness();
    penDown(harness);
    expect(harness.capability.hasCreationAwaitingClick()).toBe(false);
    harness.capability.createPointer('ink', 'up', PAGE, { x: 380, y: 300 });
    expect(harness.capability.hasCreationAwaitingClick()).toBe(false);
  });
});
