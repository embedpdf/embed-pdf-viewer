/**
 * The `editable` setting: which annotations people may change by hand. A
 * frozen annotation is selected, read and commented on, but has no handles,
 * no drag, no style properties and no text editor, and the selection's edits
 * and delete skip it; the twins and the changes stated in code don't change.
 */
import { annotationKey } from '@embedpdf/core';
import type { AnnotationFlags, AnnotationRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { annotationHarness, PAGE, type FileAnnotation } from './harness';

const NO_FLAGS: AnnotationFlags = {
  invisible: false,
  hidden: false,
  print: true,
  noZoom: false,
  noRotate: false,
  noView: false,
  readOnly: false,
  locked: false,
  toggleNoView: false,
  lockedContents: false,
};

const ref = (objectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page: PAGE,
  objectNumber,
});

const base = (objectNumber: number) => ({
  ref: ref(objectNumber),
  page: PAGE,
  index: objectNumber,
  hasAppearance: true,
  appearanceState: null,
  nm: null,
  ...NO_FLAGS,
  contents: null,
  subject: null,
  author: null,
  createdAt: null,
  modifiedAt: null,
  blendMode: 'normal',
});

/** A filled square in the file's coordinates (y up): on the page, x 40..60, y 520..530. */
const square = (objectNumber: number): FileAnnotation =>
  ({
    ...base(objectNumber),
    subtype: 'square',
    rect: { left: 40, bottom: 270, right: 60, top: 280 },
    box: { left: 40, bottom: 270, right: 60, top: 280 },
    color: '#000000',
    strokeWidth: 1,
    opacity: 1,
    interiorColor: '#ff0000',
  }) as unknown as FileAnnotation;

/** A text box in the file's coordinates: on the page, x 100..300, y 60..100. */
const textBox = (objectNumber: number): FileAnnotation =>
  ({
    ...base(objectNumber),
    contents: 'hello',
    subtype: 'free-text',
    intent: 'free-text',
    fontFamily: 'helvetica',
    fontSize: 12,
    textAlign: 'left',
    richText: {
      body: {
        family: 'Helvetica',
        weight: 400,
        italic: false,
        size: 12,
        color: '#000000',
        decoration: [],
        script: 'normal',
        letterSpacing: 0,
        horizontalScale: 1,
        align: 'left',
        dir: 'ltr',
      },
      paragraphs: [{ runs: [{ text: 'hello' }] }],
    },
    color: '#000000',
    interiorColor: null,
    opacity: 1,
    strokeWidth: 1,
    borderStyle: 'solid',
    rect: { left: 100, bottom: 700, right: 300, top: 740 },
    box: { left: 100, bottom: 700, right: 300, top: 740 },
  }) as unknown as FileAnnotation;

const SQUARE = ref(20);
const SQUARE_KEY = annotationKey(SQUARE);

const handlesOf = (harness: ReturnType<typeof annotationHarness>) =>
  harness.capability.listChromeNodes(PAGE).filter((node) => node.kind === 'handle');

/** Drag the square by its body, 30 points right. */
const drag = (harness: ReturnType<typeof annotationHarness>) => {
  harness.capability.editPointer('down', PAGE, { x: 50, y: 525 }, false);
  harness.capability.editPointer('move', PAGE, { x: 80, y: 525 }, false);
  harness.capability.editPointer('up', PAGE, { x: 80, y: 525 }, false);
};

describe('the editable setting', () => {
  it('is every annotation by default', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    expect(harness.capability.getSettings().editable).toBe(true);
    expect(harness.capability.isEditable(SQUARE)).toBe(true);
  });

  it('freezes what it leaves out: selectable, no handles, no drag, nothing to restyle', async () => {
    const harness = annotationHarness({ config: { editable: ['highlight'] } });
    await harness.load([square(20)]);
    expect(harness.capability.isEditable(SQUARE)).toBe(false);
    // The twins stay facts.
    expect(harness.capability.canUpdate(SQUARE)).toBe(true);
    expect(harness.capability.canDelete(SQUARE)).toBe(true);

    const before = harness.model().byId[SQUARE_KEY]!.annotation;
    drag(harness);
    expect(harness.capability.selection.list().map((annotation) => annotation.ref)).toEqual([
      SQUARE,
    ]);
    expect(harness.model().byId[SQUARE_KEY]!.annotation).toBe(before);
    expect(harness.update).not.toHaveBeenCalled();
    expect(handlesOf(harness)).toHaveLength(0);
    expect(harness.capability.selection.getProperties().properties).toEqual([]);
  });

  it('keeps the selection edits and delete away from a frozen annotation', async () => {
    const harness = annotationHarness({ config: { editable: false } });
    await harness.load([square(20)]);
    harness.capability.selection.set([SQUARE]);
    await harness.capability.selection.update({ opacity: 0.5 });
    await harness.capability.selection.delete();
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.remove).not.toHaveBeenCalled();
    expect(harness.capability.get(SQUARE)).not.toBeNull();
  });

  it('leaves the changes stated in code alone', async () => {
    const harness = annotationHarness({ config: { editable: false } });
    await harness.load([square(20)]);
    harness.update.mockResolvedValueOnce({
      annotation: { ...square(20), opacity: 0.5 },
      appearance: { changed: false },
    });
    await harness.capability.update(SQUARE, { subtype: 'square', opacity: 0.5 });
    expect(harness.update).toHaveBeenCalledTimes(1);
    await harness.capability.delete(SQUARE);
    expect(harness.remove).toHaveBeenCalledTimes(1);
  });

  it('follows updateSettings: frozen, then movable again', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const changes: string[][] = [];
    harness.capability.onSettingsChanged(({ changed }) => changes.push([...changed]));
    harness.capability.selection.set([SQUARE]);
    expect(handlesOf(harness)).toHaveLength(8);

    harness.capability.updateSettings({ editable: false });
    expect(handlesOf(harness)).toHaveLength(0);
    expect(harness.capability.isEditable(SQUARE)).toBe(false);

    harness.capability.updateSettings({ editable: ['square'] });
    expect(handlesOf(harness)).toHaveLength(8);
    harness.update.mockResolvedValueOnce({
      annotation: square(20),
      appearance: { changed: false },
    });
    drag(harness);
    expect(harness.model().byId[SQUARE_KEY]!.annotation.rect.x).toBeGreaterThan(40);
    expect(changes).toEqual([['editable'], ['editable']]);
  });

  it('keeps a frozen text box out of the editor, and ends typing in one it freezes', async () => {
    const harness = annotationHarness({ config: { editable: ['square'] } });
    await harness.load([textBox(30)]);
    const box = ref(30);
    harness.capability.text.begin(box);
    expect(harness.capability.getEditingId()).toBeNull();
    // A double click on it selects it instead of swallowing the press.
    expect(harness.capability.beginTextEditAt(PAGE, { x: 200, y: 80 })).toBe(false);

    harness.capability.updateSettings({ editable: true });
    expect(harness.capability.beginTextEditAt(PAGE, { x: 200, y: 80 })).toBe(true);
    harness.capability.text.end();
    harness.capability.text.begin(box);
    expect(harness.capability.getEditingId()).toBe(annotationKey(box));
    harness.capability.updateSettings({ editable: ['square'] });
    expect(harness.capability.getEditingId()).toBeNull();
  });
});
