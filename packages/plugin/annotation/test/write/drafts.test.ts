/**
 * An ink drawing that waits for its next stroke. A press on an annotation, a
 * marquee or a text edit takes the draft's place, and finishes the drawing
 * first: its strokes become an annotation. Only a cancel drops them.
 */
import { annotationKey } from '@embedpdf/core';
import { describe, expect, it } from 'vitest';

import {
  EMPTY,
  IN_TEXT_BOX,
  inkCreates,
  inkDrawingHarness,
  ON_SQUARE,
  SQUARE,
  TEXT_BOX,
} from '../fixtures/ink-drawing';
import { PAGE, type AnnotationHarness } from '../harness';

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
